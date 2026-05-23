"use client";
import { useState } from "react";
import { Course } from "@/types";

interface Props {
  course: Course;
}

export default function CourseCard({ course }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-left p-4 border border-gray-200 rounded-xl hover:border-gray-400 transition-colors bg-white"
      >
        <p className="text-sm font-medium text-gray-900">{course.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{course.institution} · {course.year}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {course.topics.slice(0, 3).map(t => (
            <span key={t} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{t}</span>
          ))}
        </div>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-base font-medium text-gray-900">{course.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{course.institution} · {course.year}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none ml-4">×</button>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{course.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {course.topics.map(t => (
                <span key={t} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
