export default function PaymentCard({ payment = {}, onVerify, onReject, actionLoading }) {
  return (
    <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 overflow-hidden flex flex-col md:flex-row">
      {/* Thumbnail / Image Area */}
      {payment.screenshotUrl ? (
        <div className="w-full md:w-48 h-48 bg-slate-900 border-r border-slate-700 shrink-0 relative overflow-hidden group">
          <img 
            src={payment.screenshotUrl} 
            alt="Payment Screenshot" 
            className="w-full h-full object-cover transition-transform group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <a href={payment.screenshotUrl} target="_blank" rel="noreferrer" className="text-white text-sm font-medium bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur">
              View Full
            </a>
          </div>
        </div>
      ) : (
        <div className="w-full md:w-48 h-48 bg-slate-800 border-r border-slate-700 flex items-center justify-center shrink-0">
          <span className="text-slate-500 text-sm">No Screenshot</span>
        </div>
      )}

      {/* Details */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-lg font-bold text-white">User: {payment.telegramId}</h3>
              <p className="text-sm text-[#3b82f6] font-mono mt-1">Course ID: {payment.courseId}</p>
            </div>
            <span className="text-slate-400 text-sm">
              {payment.createdAt ? new Date(payment.createdAt).toLocaleString() : "—"}
            </span>
          </div>
        </div>

        {/* Actions */}
        {payment.status === "pending" && (
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-700/50 justify-end">
            <button 
              onClick={() => onReject(payment.id)}
              disabled={actionLoading === payment.id}
              className="px-4 py-2 bg-red-500/10 text-red-400 font-medium rounded-lg border border-red-500/20 hover:bg-red-500/20 transition disabled:opacity-50"
            >
              Reject
            </button>
            <button 
              onClick={() => onVerify(payment.id)}
              disabled={actionLoading === payment.id}
              className="px-6 py-2 bg-green-500 text-white font-medium rounded-lg shadow-lg shadow-green-500/20 hover:bg-green-600 transition flex items-center gap-2 disabled:opacity-50"
            >
              {actionLoading === payment.id ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : "✓"}
              Verify & Grant Access
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
