/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  ShieldCheck,
  Cpu,
  HardDrive,
  Package,
  Globe,
  Wrench,
  Layers,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface AboutModalProps {
  onClose: () => void;
  onOpenHelp?: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose, onOpenHelp }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative w-full max-w-3xl max-h-[94dvh] sm:max-h-[88vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Layers className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                About MicroFlow CAD
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Architecture, Dependencies, Local Privacy &amp; No-AI Disclosure
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Close About dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {/* Disclaimer: Zero AI API Calls */}
          <div className="p-4 rounded-xl bg-emerald-950/35 border border-emerald-500/40 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs sm:text-sm">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>No AI / LLM API Dependency Disclaimer</span>
            </div>
            <p className="text-slate-200 leading-relaxed">
              MicroFlow CAD is a <strong>100% deterministic, client-side</strong> microfabrication
              cross-section and layout simulator written in TypeScript. It does{' '}
              <strong>not</strong> call Gemini, any external LLM, or any cloud AI API at runtime,
              and it does not use a backend server for simulation.
            </p>
          </div>

          {/* Local Execution & GDS Privacy */}
          <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-500/30 space-y-1.5">
            <div className="flex items-center gap-2 text-sky-300 font-semibold">
              <HardDrive className="w-4 h-4 shrink-0" />
              <span>Local-Only File &amp; GDSII Processing</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Imported <code className="font-mono text-sky-300">.gds</code> /{' '}
              <code className="font-mono text-sky-300">.gds2</code> /{' '}
              <code className="font-mono text-sky-300">.json</code> files are read directly into
              browser memory via the Web File API (<code className="font-mono">arrayBuffer()</code>{' '}
              / <code className="font-mono">DataView</code>) and never uploaded to a remote server.
              Saved flows and custom libraries stay locally in your browser&apos;s{' '}
              <code className="font-mono">localStorage</code>.
            </p>
            <p className="text-[11px] text-slate-400">
              GDSII parser safety caps: max 8,000 flattened shapes, 16 cell hierarchy levels, and
              200×200 per array reference (<code className="font-mono">AREF</code>) with zero dynamic
              code execution.
            </p>
          </div>

          {/* Active Runtime Dependencies */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 font-semibold text-slate-200">
              <Package className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Active Runtime Dependencies (Bundled in App)</span>
            </div>
            <div className="divide-y divide-slate-800/80">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <div className="font-semibold text-slate-100">React &amp; React DOM</div>
                  <div className="text-[11px] text-slate-400">
                    Declarative UI rendering and workspace state management
                  </div>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 shrink-0">
                  ^19.0.1
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <div className="font-semibold text-slate-100">Lucide React</div>
                  <div className="text-[11px] text-slate-400">
                    Vector SVG toolbar and process-step iconography
                  </div>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 shrink-0">
                  ^0.546.0
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <div className="font-semibold text-slate-100">Tailwind CSS v4</div>
                  <div className="text-[11px] text-slate-400">
                    Utility CSS compiled statically at build time via @tailwindcss/vite
                  </div>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300 shrink-0">
                  ^4.3.3
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1.5">
            <div className="font-semibold text-slate-200">MP4 Video Export</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Uses h264-mp4-encoder 1.0.12 (MIT) to create H.264 MP4 videos locally in a background worker.
              The encoder loads only when you download a video; process data stays in your browser.
            </p>
          </div>

          {/* External Network Assets & Tooling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <span>External Assets</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Loads <strong>Plus Jakarta Sans</strong> and <strong>JetBrains Mono</strong> from
                Google Fonts (<code className="font-mono">fonts.googleapis.com</code>). Falls back
                gracefully to system fonts when offline.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Wrench className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Build &amp; Dev Toolchain</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Vite (<code className="font-mono">^8.3.0</code>), TypeScript (
                <code className="font-mono">^7.0.2</code>), esbuild, tsx, and Autoprefixer — used
                only during development and static bundling.
              </p>
            </div>
          </div>

          {/* Unused Template Packages Disclosure */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Unused Starter-Template Packages in package.json</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              The project manifest retains starter-template entries (<code className="font-mono text-slate-300">@google/genai</code>,{' '}
              <code className="font-mono text-slate-300">express</code>,{' '}
              <code className="font-mono text-slate-300">dotenv</code>, and{' '}
              <code className="font-mono text-slate-300">motion</code>), none of which are imported
              or invoked anywhere in the application source code. Vite tree-shakes them out of the
              production bundle.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 border-t border-slate-800 bg-slate-900/95 shrink-0 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>MicroFlow CAD · Deterministic Client-Side Simulation</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenHelp && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHelp();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 font-medium transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>User Guide &amp; Help</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
