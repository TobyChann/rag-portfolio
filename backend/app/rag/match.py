# backend/app/rag/match.py
"""JD matcher: a job description in, each requirement graded against Toby's
documented evidence out. Two LLM calls (extract, grade); evidence gathering
in between is plain retrieval and string matching, so the grader can only
cite what was actually found."""
import asyncio
import json
import re

from sqlalchemy import select

from app.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.models import Folder, Skill
from app.rag import pipeline
from app.rag.embedder import embed_query
from app.rag.retriever import search
from app.sync.resume import get_resume_text

settings = get_settings()

MAX_REQUIREMENTS = 10
CHUNKS_PER_REQUIREMENT = 4
VERDICTS = ("strong", "partial", "gap")
KINDS = ("tool", "technique", "domain", "soft")

EXTRACT_PROMPT = f"""Extract the requirements from this job description.
Reply with JSON only:
{{"company_guess": string or null, "role_title": string or null,
  "requirements": [{{"id": "r1", "text": "...", "kind": "tool|technique|domain|soft", "must_have": true}}]}}
- At most {MAX_REQUIREMENTS} requirements, most important first; merge duplicates.
- "text" is a short phrase (max 12 words) naming one skill, tool, area or trait. Keep every tool,
  language or platform the posting names, e.g. "Cloud platforms (AWS, GCP)", "Streaming (Kafka)".
- must_have is false for "nice to have", "bonus", "preferred" and similar.
- Skip benefits, salary, location, company boilerplate and equal-opportunity text.
- company_guess: the hiring company if the text names it, else null."""

GRADE_PROMPT = """You grade how well Toby's documented evidence meets each job requirement.
Use ONLY the evidence listed under each requirement and the resume. Never invent
experience, and never use general knowledge about what a student "probably" knows.

verdict:
- "strong": the evidence shows direct, substantial work with this exact thing.
- "partial": the same skill at a lower level (coursework, an introduction, one project), or a direct
  equivalent of a named tool (e.g. another BI tool for "Power BI").
- "gap": no evidence, or only tangential mentions. When unsure, choose "gap".
Rules:
- A named tool, language or platform needs evidence of that tool or a direct equivalent. A course on
  a broad topic is not evidence for a specific tool.
- Soft skills (communication, attention to detail, teamwork) are "strong" only with a concrete
  example from the resume or notes; a course title alone is at most "partial".

Reply with JSON only:
{"rows": [{"id": "r1", "verdict": "strong|partial|gap", "rationale": "...", "evidence": ["<id>", ...]}],
 "summary": {"fits": "...", "grow": "..."}}
- One row per requirement, same ids, same order.
- rationale: at most 25 words, factual, naming what the evidence shows (or that none was found).
- evidence: ids from that requirement's list ("c:..." excerpts, "skill:...", "module:...") or "resume".
  Empty for a gap.
- summary.fits: one sentence on where Toby fits this role; summary.grow: one or two sentences on
  where Toby would need to grow. Base both only on the rows you graded.
- Refer to Toby by name. Never use pronouns for Toby (no he/she/they/his/her/their);
  repeat the name or restructure the sentence instead."""

_STOP = set("and or the a an of for to in with on at by from as is are be using use experience "
            "knowledge strong good ability skills skill understanding familiarity working work years".split())


# Words too broad to tie a skill to a requirement on their own.
_GENERIC = set("data analysis analytics analytical management modelling modeling design development "
               "engineering business process processes systems system financial finance accounting "
               "reporting project projects cloud web software tools platform platforms programming model "
               "models documentation team teams product products quality".split())


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9+#.]+", s.lower()) if len(t) > 1 and t not in _STOP}


def _display(title: str) -> str:
    return re.sub(r"^(Lab |General )?Notes_", "", title or "").replace("_", " ").strip()


async def _json_call(system: str, user: str, max_tokens: int) -> dict:
    res = await pipeline._complete_with_retry(
        model=pipeline.RAG_MODEL, temperature=0, max_tokens=max_tokens,
        response_format={"type": "json_object"}, **pipeline._EXTRA_PARAMS,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
    return json.loads(res.choices[0].message.content or "{}")


async def extract_requirements(jd: str) -> dict:
    data = await _json_call(EXTRACT_PROMPT, jd, 900)
    reqs = []
    for i, r in enumerate(data.get("requirements") or []):
        text = str(r.get("text") or "").strip()
        if not text:
            continue
        reqs.append({"id": f"r{len(reqs) + 1}", "text": text[:120],
                     "kind": r.get("kind") if r.get("kind") in KINDS else "domain",
                     "must_have": r.get("must_have") is not False})
        if len(reqs) == MAX_REQUIREMENTS:
            break
    return {"company_guess": (data.get("company_guess") or None), "role_title": (data.get("role_title") or None),
            "requirements": reqs}


async def gather_evidence(reqs: list[dict]) -> dict[str, dict]:
    """Per requirement: top note chunks, matching board skills, matching modules."""
    async with AsyncSessionLocal() as db:
        skills = (await db.execute(select(Skill.name).where(
            Skill.achieved == True, Skill.category.isnot(None)))).scalars().all()  # noqa: E712
        courses = (await db.execute(select(Folder.name).where(Folder.is_course == True))).scalars().all()  # noqa: E712

    # Requirements name tools ("AWS", "Kafka"), so evidence search always adds
    # keyword matching on top of whichever vector backend the chat uses.
    mode = "pg_hybrid" if settings.retrieval_mode.startswith("pg") else "hybrid"

    async def one(r: dict) -> dict:
        toks = _tokens(r["text"])
        hits = await search(r["text"], await embed_query(r["text"]), mode=mode, top_k=CHUNKS_PER_REQUIREMENT)
        return {
            "chunks": [{"id": h["id"], "google_doc_id": h["doc_id"], "title": _display(h["doc_title"]),
                        "heading": re.sub(r"^#+\s*", "", h["heading"] or ""), "text": h["text"][:600]} for h in hits],
            # A board skill counts when one of its distinctive words is in the
            # requirement: "AWS Glue" for "cloud platforms (AWS or GCP)".
            "skills": [s for s in skills if (_tokens(s) - _GENERIC) & toks],
            # Two shared words, or the whole course name: one generic word
            # ("financial") would tie every finance course to every finance requirement.
            "modules": [c for c in courses if (ct := _tokens(c)) and (len(ct & toks) >= 2 or ct <= toks)],
        }

    found = await asyncio.gather(*(one(r) for r in reqs))
    return {r["id"]: ev for r, ev in zip(reqs, found)}


def _grade_input(reqs: list[dict], evidence: dict[str, dict], resume: str) -> str:
    parts = []
    for r in reqs:
        ev = evidence[r["id"]]
        lines = [f"{r['id']} [{r['kind']}, {'must-have' if r['must_have'] else 'nice-to-have'}]: {r['text']}"]
        lines += [f"  skill:{s}  (on Toby's curated skills board)" for s in ev["skills"]]
        lines += [f"  module:{m}  (a course Toby took)" for m in ev["modules"]]
        lines += [f"  c:{c['id']}  ({c['title']} — {c['heading']}): {c['text']}" for c in ev["chunks"]]
        parts.append("\n".join(lines))
    return ("REQUIREMENTS AND EVIDENCE\n\n" + "\n\n".join(parts)
            + f"\n\nRESUME (evidence id \"resume\")\n{resume[:6000] or '(none)'}")


def _clean_row(r: dict, ev: dict, g: dict) -> dict:
    """Keep the grader honest: unknown evidence ids are dropped, and a claimed
    match left with no valid evidence becomes a gap."""
    chunks = {f"c:{c['id']}": c for c in ev["chunks"]}
    cited = []
    for e in g.get("evidence") or []:
        if e in chunks:
            c = chunks[e]
            cited.append({"kind": "note", "chunk_id": c["id"], "google_doc_id": c["google_doc_id"],
                          "title": c["title"], "heading": c["heading"]})
        elif e == "resume":
            cited.append({"kind": "resume"})
        elif e.startswith("skill:") and e[6:] in ev["skills"]:
            cited.append({"kind": "skill", "name": e[6:]})
        elif e.startswith("module:") and e[7:] in ev["modules"]:
            cited.append({"kind": "module", "name": e[7:]})
    verdict = g.get("verdict") if g.get("verdict") in VERDICTS else "gap"
    if verdict != "gap" and not cited:
        verdict = "gap"
    return {**r, "verdict": verdict, "rationale": str(g.get("rationale") or "")[:240],
            "evidence": cited if verdict != "gap" else []}


_ROWS_KEY = re.compile(r'"rows"\s*:\s*$')


async def _graded_rows(user: str):
    """Stream the grading call and yield ("row", obj) as each object in the
    "rows" array closes, then ("final", whole JSON). Rows reach the page while
    the model is still writing the rest."""
    stream = await pipeline._complete_with_retry(
        model=pipeline.RAG_MODEL, temperature=0, max_tokens=2500, stream=True,
        response_format={"type": "json_object"}, **pipeline._EXTRA_PARAMS,
        messages=[{"role": "system", "content": GRADE_PROMPT}, {"role": "user", "content": user}])
    buf, pos, depth, start, in_str, esc, in_rows = "", 0, 0, -1, False, False, False
    async for event in stream:
        buf += (event.choices[0].delta.content or "") if event.choices else ""
        while pos < len(buf):
            ch = buf[pos]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif not in_rows:
                if ch == "[" and _ROWS_KEY.search(buf, 0, pos):
                    in_rows = True
            elif ch == "{":
                if depth == 0:
                    start = pos
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start >= 0:
                    try:
                        yield "row", json.loads(buf[start:pos + 1])
                    except ValueError:
                        pass
                    start = -1
            elif ch == "]" and depth == 0:
                in_rows = False
            pos += 1
    yield "final", json.loads(buf or "{}")


async def stream_match(jd: str):
    """Events: requirements, one row per requirement, summary. Exceptions propagate."""
    extracted = await extract_requirements(jd)
    reqs = extracted["requirements"]
    yield {"type": "requirements", **extracted}
    if not reqs:
        yield {"type": "summary", "counts": {v: 0 for v in VERDICTS},
               "fits": "No requirements could be found in that text.", "grow": ""}
        return

    evidence = await gather_evidence(reqs)
    by_id = {r["id"]: r for r in reqs}
    rows, graded = [], {}
    async for kind, obj in _graded_rows(_grade_input(reqs, evidence, await get_resume_text())):
        if kind == "final":
            graded = obj
        elif obj.get("id") in by_id and all(r["id"] != obj["id"] for r in rows):
            rows.append(_clean_row(by_id[obj["id"]], evidence[obj["id"]], obj))
            yield {"type": "row", "row": rows[-1]}
    for r in reqs:   # anything the grader skipped is shown as a gap, never dropped
        if all(row["id"] != r["id"] for row in rows):
            rows.append(_clean_row(r, evidence[r["id"]], {}))
            yield {"type": "row", "row": rows[-1]}
    summary = graded.get("summary") or {}
    yield {"type": "summary", "counts": {v: sum(r["verdict"] == v for r in rows) for v in VERDICTS},
           "fits": str(summary.get("fits") or "")[:400], "grow": str(summary.get("grow") or "")[:400]}
