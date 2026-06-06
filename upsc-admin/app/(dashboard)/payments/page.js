"use client";

import { useState, useEffect } from "react";

import PaymentCard from "@/components/PaymentCard";

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("pending");
  const [actionLoading, setActionLoading] = useState(null);

  const fetchPayments = (status) => {
    setLoading(true);
    fetch(`/api/payments?status=${status}`)
      .then(res => res.json())
      .then(data => setPayments(data.payments || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayments(statusTab);
  }, [statusTab]);

  const handleStatusChange = async (paymentId, newStatus) => {
    if (!confirm(`Are you sure you want to mark this payment as ${newStatus}?`)) return;
    
    setActionLoading(paymentId);
    try {
      const res = await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, status: newStatus }),
      });
      if (res.ok) {
        // Refresh the current tab
        fetchPayments(statusTab);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update payment status");
    } finally {
      setActionLoading(null);
    }
  };

  const tabs = [
    { id: "pending", label: "Pending Verification" },
    { id: "verified", label: "Verified" },
    { id: "rejected", label: "Rejected" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Payments Verification</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusTab(tab.id)}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
              statusTab === tab.id 
                ? "border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10" 
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Payments List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-[#1e293b] rounded-xl border border-slate-700 p-12 text-center text-slate-400">
          No {statusTab} payments found.
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map(payment => (
            <PaymentCard 
              key={payment.id} 
              payment={payment} 
              onVerify={(id) => handleStatusChange(id, "verified")} 
              onReject={(id) => handleStatusChange(id, "rejected")} 
              actionLoading={actionLoading} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
