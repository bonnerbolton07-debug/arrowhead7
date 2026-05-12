'use client';

// TODO: Full editor interface
// This will be the main editing workspace where users:
// 1. Upload source footage
// 2. Select a Style DNA profile (or upload reference)
// 3. Preview and adjust the autonomous edit
// 4. Trigger cloud rendering
// 5. Review and publish

import { useState } from 'react';

type EditorStep = 'upload' | 'style' | 'preview' | 'render' | 'complete';

export default function EditorPage() {
  const [step, setStep] = useState<EditorStep>('upload');

  return (
    <div className="min-h-screen bg-a7-black flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-a7-gray">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-a7-light/50 hover:text-a7-white text-sm">
            &larr; Dashboard
          </a>
          <span className="text-a7-gray">|</span>
          <span className="font-medium">New Edit</span>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {(['upload', 'style', 'preview', 'render', 'complete'] as EditorStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full transition-colors ${
                  step === s ? 'bg-a7-accent' : i < ['upload', 'style', 'preview', 'render', 'complete'].indexOf(step) ? 'bg-a7-green' : 'bg-a7-gray'
                }`}
              />
              <span className={`text-xs ${step === s ? 'text-a7-white' : 'text-a7-light/30'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ))}
        </div>

        <button className="text-sm text-a7-light/50 hover:text-a7-white">
          Save Draft
        </button>
      </header>

      {/* Editor Content */}
      <main className="flex-1 flex items-center justify-center p-8">
        {step === 'upload' && (
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-bold mb-2 text-center">Upload Your Footage</h2>
            <p className="text-a7-light/50 text-sm mb-8 text-center">
              Drop in the raw video you want edited.
            </p>

            {/* Upload Zone */}
            <div className="border-2 border-dashed border-a7-gray rounded-xl p-16 text-center hover:border-a7-accent/50 transition-colors cursor-pointer">
              <div className="text-4xl text-a7-light/20 mb-4">&#8679;</div>
              <p className="text-a7-light/50 text-sm mb-2">Drag & drop your video here</p>
              <p className="text-a7-light/30 text-xs">MP4, MOV, AVI up to 2GB</p>
            </div>

            <button
              onClick={() => setStep('style')}
              className="w-full mt-6 bg-a7-accent hover:bg-a7-accent-hover text-white py-3 rounded-md font-medium transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'style' && (
          <div className="w-full max-w-xl">
            <h2 className="text-xl font-bold mb-2 text-center">Choose Your Style</h2>
            <p className="text-a7-light/50 text-sm mb-8 text-center">
              Select a Style DNA profile or upload a reference video.
            </p>

            {/* Style DNA Selection — TODO */}
            <div className="bg-a7-dark border border-a7-gray rounded-lg p-8 text-center mb-4">
              <p className="text-a7-light/40 text-sm">No Style DNA profiles yet.</p>
              <button className="mt-4 text-a7-accent text-sm hover:underline">
                + Upload Reference Video
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('upload')}
                className="flex-1 py-3 rounded-md font-medium text-sm border border-a7-gray text-a7-light/60 hover:text-a7-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('preview')}
                className="flex-1 bg-a7-accent hover:bg-a7-accent-hover text-white py-3 rounded-md font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="w-full max-w-3xl text-center">
            <h2 className="text-xl font-bold mb-2">Preview</h2>
            <p className="text-a7-light/50 text-sm mb-8">
              Review the autonomous edit before rendering.
            </p>

            {/* Video Preview — TODO: Implement preview player */}
            <div className="bg-a7-dark border border-a7-gray rounded-lg aspect-video flex items-center justify-center mb-6">
              <p className="text-a7-light/30 text-sm">Preview will appear here</p>
            </div>

            <div className="flex gap-3 max-w-md mx-auto">
              <button
                onClick={() => setStep('style')}
                className="flex-1 py-3 rounded-md font-medium text-sm border border-a7-gray text-a7-light/60 hover:text-a7-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('render')}
                className="flex-1 bg-a7-accent hover:bg-a7-accent-hover text-white py-3 rounded-md font-medium transition-colors"
              >
                Render (1 Credit)
              </button>
            </div>
          </div>
        )}

        {step === 'render' && (
          <div className="w-full max-w-md text-center">
            <h2 className="text-xl font-bold mb-2">Rendering</h2>
            <p className="text-a7-light/50 text-sm mb-8">
              Cloud rendering in progress. This usually takes 2-5 minutes.
            </p>

            {/* Progress */}
            <div className="w-full bg-a7-gray rounded-full h-2 mb-4">
              <div className="bg-a7-accent h-2 rounded-full shimmer" style={{ width: '35%' }} />
            </div>
            <p className="text-a7-light/40 text-xs">Rendering... 35%</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="w-full max-w-md text-center">
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="text-xl font-bold mb-2">Edit Complete</h2>
            <p className="text-a7-light/50 text-sm mb-8">
              Your video is ready to download or publish.
            </p>

            <div className="flex gap-3">
              <button className="flex-1 py-3 rounded-md font-medium text-sm border border-a7-gray text-a7-light/60 hover:text-a7-white transition-colors">
                Download
              </button>
              <button className="flex-1 bg-a7-accent hover:bg-a7-accent-hover text-white py-3 rounded-md font-medium transition-colors">
                Publish
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
