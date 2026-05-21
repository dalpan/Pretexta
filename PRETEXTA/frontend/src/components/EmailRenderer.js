import React from 'react';
import { Star, Reply, Forward, Trash2, MoreHorizontal, Paperclip } from 'lucide-react';

export default function EmailRenderer({ email }) {
  const { from, to, subject, body, date, attachments, cc } = email || {};

  return (
    <div className="bg-white text-gray-900 rounded-lg overflow-hidden shadow-lg max-w-2xl mx-auto font-sans">
      {/* Email Header Bar */}
      <div className="bg-gray-100 border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="p-1 hover:bg-gray-200 rounded"><Reply className="w-4 h-4 text-gray-600" /></button>
          <button className="p-1 hover:bg-gray-200 rounded"><Forward className="w-4 h-4 text-gray-600" /></button>
          <button className="p-1 hover:bg-gray-200 rounded"><Trash2 className="w-4 h-4 text-gray-600" /></button>
        </div>
        <button className="p-1 hover:bg-gray-200 rounded"><MoreHorizontal className="w-4 h-4 text-gray-600" /></button>
      </div>

      {/* Subject */}
      <div className="px-6 pt-4 pb-2">
        <h2 className="text-xl font-semibold text-gray-900">{subject || 'No Subject'}</h2>
      </div>

      {/* Sender Info */}
      <div className="px-6 py-3 flex items-start justify-between border-b">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
            {(from || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-gray-900">{from || 'Unknown Sender'}</span>
            </div>
            <p className="text-xs text-gray-500">
              to {to || 'me'}
              {cc && <span>, cc: {cc}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{date || new Date().toLocaleString()}</span>
          <Star className="w-4 h-4 text-gray-300 hover:text-yellow-400 cursor-pointer" />
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4">
        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {body || 'No content'}
        </div>
      </div>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="px-6 py-3 border-t">
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded text-sm cursor-pointer hover:bg-gray-200">
                <Paperclip className="w-4 h-4 text-gray-500" />
                <span className="text-gray-700">{att.name || `attachment_${idx + 1}`}</span>
                <span className="text-xs text-gray-400">{att.size || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
