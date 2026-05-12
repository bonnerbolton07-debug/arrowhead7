'use client';

// TODO: Full editor interface
// This will be the main editing workspace where users:
// 1. Upload source footage
// 2. Select a Style DNA profile (or upload reference)
// 3. Preview and adjust the autonomous edit
// 4. Trigger cloud rendering
// 5. Review and publish

import { useState } from 'react';
import { Logo, LogoIcon } from '@/components/ui/Logo';

type EditorStep = 'upload' | 'style' | 'preview' | 'render' | 'complete';

const steps: EditorStep[] = ['upload', 'style', 'preview', 'render', 'complete'];

export default function EditorPage() {
  const [step, setStep] = useState<EditorStep>('upload');

  const stepIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-gradient-to-b from-a7-base to-a7-void flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 30%, rgba(45,212,191,0.03) 0%, transparent 50%)'
      }} />

      {/* Top Bar */}
      <header className="relative flex items-center justify-between px-6 py-4 border-b border-a7-text/[0.04]">
        <div className="absolute bottom-0 left-6 right-6 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.12), rgba(184,115,51,0.08), transparent)' }} />
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="flex items-center gap-3 text-a7-text/40 hover:text-a7-text text-sm transition-colors">
            <LogoIcon size={24} variant="dual" />
            <span>&larr; Dashboard</span>
          </a>
          <span className="text-a7-text/10">|</span>
          <span className="font-medium text-a7-text">New Edit</span>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-3">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full transition-all"
                style={
                  step === s
                    ? { background: 'linear-gradient(135deg, #2DD4BF, #5BE8D5)', boxShadow: '0 0 8px rgba(45,212,191,0.5)' }
                    : i < stepIndex
                      ? { background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)' }
                      : { background: 'rgba(245,240,232,0.1)' }
                } />
              <span className={`text-xs ${step === s ? 'text-a7-text' : 'text-a7-text/20'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ))}
        </div>

        <button className="text-sm text-a7-text/40 hover:text-a7-text transition-colors">
          Save Draft
        </button>
      </header>

      {/* Editor Content */}
      <main className="flex-1 flex items-center justify-center p-8 relative z-10">
        {step === 'upload' && (
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-bold mb-2 text-center text-a7-text">Upload Your Footage</h2>
            <p className="text-a7-text/40 text-sm mb-8 text-center">
              Drop in the raw video you want edited.
            </p>

            {/* Upload Zone */}
            <div className="relative overflow-hidden border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all hover:scale-[1.005]"
              style={{
                borderColor: 'rgba(45,212,191,0.15)',
                background: 'linear-gradient(135deg, rgba(45,212,191,0.03), rgba(45,212,191,0.005))',
              }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.2), transparent)' }} />
              {/* Custom upload arrow icon */}
              <svg viewBox="0 0 32 32" width="48" height="48" className="mx-auto mb-4">
                <defs>
                  <linearGradient id="upload-grad" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="rgba(45,212,191,0.1)" />
                    <stop offset="100%" stopColor="rgba(45,212,191,0.3)" />
                  </linearGradient>
                </defs>
                <line x1="16" y1="24" x2="16" y2="6" stroke="url(#upload-grad)" strokeWidth="2.5" strokeLinecap="round" />
                <polyline points="8,13 16,5 24,13" fill="none" stroke="url(#upload-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="6" y1="28" x2="26" y2="28" stroke="url(#upload-grad)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <p className="text-a7-text/40 text-sm mb-2">Drag & drop your video here</p>
              <p className="text-a7-text/20 text-xs">MP4, MOV, AVI up to 2GB</p>
            </div>

            <button
              onClick={() => setStep('style')}
              className="w-full mt-6 py-3 rounded-md font-medium transition-all text-a7-void"
              style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)', boxShadow: '0 0 20px rgba(45,212,191,0.25)' }}>
              Continue
            </button>
          </div>
        )}

        {step === 'style' && (
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-bold mb-2 text-center text-a7-text">Choose Your Style</h2>
            <p className="text-a7-text/40 text-sm mb-8 text-center">
              Select a Style DNA profile or upload a reference video.
            </p>

            {/* Style DNA Selection */}
            <div className="relative overflow-hidden rounded-lg p-8 text-center mb-4"
              style={{
                background: 'linear-gradient(135deg, rgba(184,115,51,0.04), rgba(184,115,51,0.01))',
                border: '1px solid rgba(184,115,51,0.08)',
                boxShadow: '0 0 15px rgba(184,115,51,0.05)',
              }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(184,115,51,0.25), transparent)' }} />
              <p className="text-a7-text/30 text-sm">No Style DNA profiles yet.</p>
              <button className="mt-4 text-sm text-grad-copper hover:underline">
                + Upload Reference Video
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('upload')}
                className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                  border: '1px solid rgba(245,240,232,0.06)',
                  color: 'rgba(245,240,232,0.5)',
                }}>
                Back
              </button>
              <button
                onClick={() => setStep('preview')}
                className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void"
                style={{ background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)', boxShadow: '0 0 20px rgba(45,212,191,0.25)' }}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="w-full max-w-3xl text-center">
            <h2 className="text-xl font-bold mb-2 text-a7-text">Preview</h2>
            <p className="text-a7-text/40 text-sm mb-8">
              Review the autonomous edit before rendering.
            </p>

            {/* Video Preview */}
            <div className="relative overflow-hidden rounded-lg aspect-video flex items-center justify-center mb-6"
              style={{
                background: 'linear-gradient(180deg, #10100E, #0C0C0A)',
                border: '1px solid rgba(245,240,232,0.04)',
              }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.1), transparent)' }} />
              {/* Custom play icon */}
              <svg viewBox="0 0 48 48" width="48" height="48" className="opacity-20">
                <defs>
                  <linearGradient id="play-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2DD4BF" />
                    <stop offset="100%" stopColor="#B87333" />
                  </linearGradient>
                </defs>
                <polygon points="16,10 38,24 16,38" fill="url(#play-grad)" />
              </svg>
            </div>

            <div className="flex gap-3 max-w-md mx-auto">
              <button
                onClick={() => setStep('style')}
                className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                  border: '1px solid rgba(245,240,232,0.06)',
                  color: 'rgba(245,240,232,0.5)',
                }}>
                Back
              </button>
              <button
                onClick={() => setStep('render')}
                className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void"
                style={{ background: 'linear-gradient(135deg, #8B5A2B, #B87333, #D4944A)', boxShadow: '0 0 20px rgba(184,115,51,0.3)' }}>
                Render (1 Credit)
              </button>
            </div>
          </div>
        )}

        {step === 'render' && (
          <div className="w-full max-w-md text-center">
            {/* Animated logo during render */}
            <div className="mb-6">
              <Logo variant="teal" size="md" animate />
            </div>
            <h2 className="text-xl font-bold mb-2 text-a7-text">Rendering</h2>
            <p className="text-a7-text/40 text-sm mb-8">
              Cloud rendering in progress. This usually takes 2-5 minutes.
            </p>

            {/* Progress */}
            <div className="w-full rounded-full h-2 mb-4"
              style={{ background: 'linear-gradient(90deg, #1A1918, #10100E)' }}>
              <div className="h-2 rounded-full shimmer" style={{
                width: '35%',
                background: 'linear-gradient(135deg, #1a9e8f, #2DD4BF)',
                boxShadow: '0 0 15px rgba(45,212,191,0.4)',
              }} />
            </div>
            <p className="text-a7-text/30 text-xs">Rendering... 35%</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="w-full max-w-md text-center">
            {/* Custom checkmark icon */}
            <svg viewBox="0 0 48 48" width="56" height="56" className="mx-auto mb-4" style={{
              filter: 'drop-shadow(0 0 12px rgba(45,212,191,0.4))'
            }}>
              <defs>
                <linearGradient id="check-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1a9e8f" />
                  <stop offset="100%" stopColor="#5BE8D5" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="22" fill="none" stroke="url(#check-grad)" strokeWidth="2" />
              <polyline points="14,24 21,32 34,16" fill="none" stroke="url(#check-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="text-xl font-bold mb-2 text-a7-text">Edit Complete</h2>
            <p className="text-a7-text/40 text-sm mb-8">
              Your video is ready to download or publish.
            </p>

            <div className="flex gap-3">
              <button className="flex-1 py-3 rounded-md font-medium text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,240,232,0.04), rgba(245,240,232,0.01))',
                  border: '1px solid rgba(245,240,232,0.06)',
                  color: 'rgba(245,240,232,0.5)',
                }}>
                Download
              </button>
              <button className="flex-1 py-3 rounded-md font-medium transition-all text-a7-void"
                style={{ background: 'linear-gradient(135deg, #2DD4BF, #B87333)', boxShadow: '0 0 20px rgba(45,212,191,0.2), 0 0 20px rgba(184,115,51,0.2)' }}>
                Publish
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
