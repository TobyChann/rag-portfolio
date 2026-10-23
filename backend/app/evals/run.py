# backend/app/evals/run.py
"""Retrieval / answer eval over evals/golden.jsonl.

    python -m app.evals.run                         # dense (current default)
    python -m app.evals.run --modes dense,hybrid,pg_dense,pg_hybrid
    python -m app.evals.run --answers --judge       # also generate + grade answers

Per retrieval mode: recall@5 and MRR over expected notes, hit@1, and search
latency (embedding excluded, so backends compare like for like). --answers
adds the must_mention hit rate (OpenAI, a few cents per run); --judge adds a
1-5 faithfulness score from Gemini flash-lite (free tier, paced). Each mode's
result is stored as an eval_runs row unless --no-save."""
import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path

from app.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.models import EvalRun
from app.llm import gemini_client
from app.rag import pipeline
from app.rag.embedder import embed_query
from app.rag.overview import get_overview
from app.rag.retriever import search
from app.sync.resume import get_resume_text

GOLDEN = Path(__file__).resolve().parents[2] / "evals" / "golden.jsonl"
MODES = ("dense", "pg_dense", "hybrid", "pg_hybrid")
JUDGE_PACING_SECONDS = 2.5

JUDGE_PROMPT = """Rate how well the ANSWER is supported by the CONTEXT, from 1 to 5:
5 = every claim is in the context; 3 = mostly supported, minor unsupported details;
1 = largely unsupported or contradicts the context. Saying the context doesn't
cover the question counts as supported. Reply with JSON only: {"score": <1-5>}"""


def load_golden() -> list[dict]:
    return [json.loads(line) for line in GOLDEN.read_text(encoding="utf-8").splitlines() if line.strip()]


def _pct(xs: list[float], p: float) -> float:
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))], 1) if xs else 0.0


async def _answer(q: str, chunks: list[dict]) -> tuple[str, str]:
    """The answer, plus the exact context it was written from (resume and
    modules overview included) for the judge."""
    messages = pipeline._llm_messages(q, chunks, await get_resume_text(), await get_overview())
    res = await pipeline._complete_with_retry(model=pipeline.RAG_MODEL, messages=messages, **pipeline._GEN_PARAMS)
    return res.choices[0].message.content or "", messages[1]["content"]


async def _judge(context: str, answer: str) -> int | None:
    for attempt in range(4):
        try:
            res = await gemini_client().chat.completions.create(
                model=get_settings().tag_model, temperature=0, reasoning_effort="none",
                messages=[{"role": "system", "content": JUDGE_PROMPT},
                          {"role": "user", "content": f"CONTEXT AND QUESTION:\n{context}\n\nANSWER:\n{answer}"}])
            text = res.choices[0].message.content or ""
            return int(json.loads(text[text.index("{"):text.rindex("}") + 1])["score"])
        except Exception as e:
            print(f"[eval] judge retry {attempt + 1}: {e}")
            await asyncio.sleep(10 * (attempt + 1))
    return None


async def eval_mode(mode: str, golden: list[dict], vectors: dict[str, list[float]], top_k: int,
                    answers: bool, judge: bool) -> dict:
    await search("warm up", vectors[golden[0]["id"]], mode, top_k)
    rows = []
    for g in golden:
        t0 = time.perf_counter()
        hits = await search(g["q"], vectors[g["id"]], mode, top_k)
        ms = (time.perf_counter() - t0) * 1000
        docs = list(dict.fromkeys(h["doc_id"] for h in hits))
        expect = set(g["expect_docs"])
        row = {"id": g["id"], "kind": g["kind"], "ms": round(ms, 1), "docs": docs[:5],
               "chunks": [{"id": h["id"], "dense_rank": h.get("dense_rank"),
                           "lexical_rank": h.get("lexical_rank")} for h in hits]}
        if expect:
            rank = next((i + 1 for i, d in enumerate(docs) if d in expect), None)
            row.update(recall=len(expect & set(docs[:5])) / len(expect),
                       rr=1 / rank if rank else 0.0, hit1=float(bool(docs) and docs[0] in expect))
        if answers:
            text, context = await _answer(g["q"], hits)
            row["answer"] = text
            if g["must_mention"]:
                row["mention"] = sum(m.lower() in text.lower() for m in g["must_mention"]) / len(g["must_mention"])
            if judge:
                row["faithfulness"] = await _judge(context, text)
                await asyncio.sleep(JUDGE_PACING_SECONDS)
        rows.append(row)

    def summary(subset: list[dict]) -> dict:
        scored = [r for r in subset if "recall" in r]
        out = {"n": len(subset), "scored": len(scored)}
        if scored:
            out.update(recall_at_5=round(statistics.mean(r["recall"] for r in scored), 3),
                       mrr=round(statistics.mean(r["rr"] for r in scored), 3),
                       hit_at_1=round(statistics.mean(r["hit1"] for r in scored), 3))
        mentions = [r["mention"] for r in subset if "mention" in r]
        if mentions:
            out["mention_rate"] = round(statistics.mean(mentions), 3)
        faith = [r["faithfulness"] for r in subset if r.get("faithfulness")]
        if faith:
            out["faithfulness"] = round(statistics.mean(faith), 2)
        return out

    metrics = summary(rows)
    metrics.update(p50_ms=_pct([r["ms"] for r in rows], 0.5), p95_ms=_pct([r["ms"] for r in rows], 0.95),
                   by_kind={k: summary([r for r in rows if r["kind"] == k])
                            for k in dict.fromkeys(r["kind"] for r in rows)})
    return {"config": {"mode": mode, "top_k": top_k, "answers": answers, "judge": judge,
                       "golden_size": len(golden)},
            "metrics": metrics, "per_question": rows}


async def run_eval(modes: list[str], top_k: int = 5, answers: bool = False, judge: bool = False,
                   save: bool = True) -> list[dict]:
    golden = load_golden()
    vectors = {g["id"]: await embed_query(g["q"]) for g in golden}
    results = []
    for mode in modes:
        result = await eval_mode(mode, golden, vectors, top_k, answers, judge)
        if save:
            async with AsyncSessionLocal() as db:
                run = EvalRun(**result)
                db.add(run)
                await db.commit()
                result["id"] = str(run.id)
        results.append(result)
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", default="dense", help=f"comma list of {', '.join(MODES)}")
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--answers", action="store_true")
    ap.add_argument("--judge", action="store_true")
    ap.add_argument("--no-save", action="store_true")
    args = ap.parse_args()
    modes = [m.strip() for m in args.modes.split(",")]
    bad = [m for m in modes if m not in MODES]
    if bad:
        ap.error(f"unknown mode(s): {bad}")

    results = asyncio.run(run_eval(modes, args.top_k, args.answers, args.judge, not args.no_save))
    for r in results:
        m = r["metrics"]
        print(f"\n== {r['config']['mode']}  recall@5={m.get('recall_at_5')}  MRR={m.get('mrr')}  "
              f"hit@1={m.get('hit_at_1')}  p50={m['p50_ms']}ms  p95={m['p95_ms']}ms"
              + (f"  mention={m['mention_rate']}" if "mention_rate" in m else "")
              + (f"  faithfulness={m['faithfulness']}" if "faithfulness" in m else ""))
        for kind, km in m["by_kind"].items():
            print(f"   {kind:14} n={km['n']:2}  recall@5={km.get('recall_at_5')}  MRR={km.get('mrr')}")
        misses = [q["id"] for q in r["per_question"] if q.get("rr") == 0.0]
        if misses:
            print("   misses:", ", ".join(misses))


if __name__ == "__main__":
    main()
