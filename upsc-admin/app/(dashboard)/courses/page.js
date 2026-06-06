"use client";

import { useState, useEffect } from "react";

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ id: "", name: "", description: "", price: "", channelId: "", groupId: "", welcomeMessage: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchCourses = () => {
    setLoading(true);
    fetch("/api/courses")
      .then(res => res.json())
      .then(data => setCourses(data.courses?.filter(c => c.active !== false) || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleEdit = (course) => {
    setFormData(course);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this course?")) return;
    await fetch(`/api/courses?id=${id}`, { method: "DELETE" });
    fetchCourses();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const method = isEditing ? "PATCH" : "POST";
    await fetch("/api/courses", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    setSubmitting(false);
    setShowForm(false);
    setFormData({ id: "", name: "", description: "", price: "", channelId: "", groupId: "", welcomeMessage: "" });
    setIsEditing(false);
    fetchCourses();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Courses Management</h1>
        <button 
          onClick={() => {
            setShowForm(!showForm);
            setIsEditing(false);
            setFormData({ id: "", name: "", description: "", price: "", channelId: "", groupId: "", welcomeMessage: "" });
          }}
          className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg font-medium hover:bg-blue-600 transition shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          {showForm ? "✕ Cancel" : "＋ Add Course"}
        </button>
      </div>

      {/* Inline Form */}
      {showForm && (
        <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 p-6 animate-in slide-in-from-top-4">
          <h2 className="text-lg font-semibold mb-4">{isEditing ? "Edit Course" : "Create New Course"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Course Name</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
              <textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Price (₹)</label>
              <input required type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full px-4 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Channel ID (e.g., @channel)</label>
              <input type="text" value={formData.channelId} onChange={e => setFormData({...formData, channelId: e.target.value})} className="w-full px-4 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Group ID (e.g., @group)</label>
              <input type="text" value={formData.groupId} onChange={e => setFormData({...formData, groupId: e.target.value})} className="w-full px-4 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Welcome Message (sent after purchase)</label>
              <textarea rows={2} value={formData.welcomeMessage} onChange={e => setFormData({...formData, welcomeMessage: e.target.value})} className="w-full px-4 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none" />
            </div>
            <div className="md:col-span-2 flex justify-end mt-2">
              <button disabled={submitting} type="submit" className="px-6 py-2 bg-[#3b82f6] text-white rounded-lg font-medium hover:bg-blue-600 transition disabled:opacity-50">
                {submitting ? "Saving..." : "Save Course"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Courses Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-12 text-center text-slate-400">
          No active courses found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <div key={course.id} className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-white line-clamp-2">{course.name}</h3>
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 font-bold rounded-lg border border-green-500/30">
                    ₹{course.price}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-4 line-clamp-3">{course.description || "No description provided."}</p>
                
                <div className="space-y-2 text-xs font-mono text-slate-500 bg-[#0f172a] p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Channel:</span> 
                    <span className="text-slate-300">{course.channelId || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Group:</span> 
                    <span className="text-slate-300">{course.groupId || "—"}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-800/50 border-t border-slate-700 flex justify-end gap-3">
                <button onClick={() => handleEdit(course)} className="px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition">
                  Edit
                </button>
                <button onClick={() => handleDelete(course.id)} className="px-3 py-1.5 text-sm font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 border border-red-500/20 hover:border-transparent rounded-lg transition">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
