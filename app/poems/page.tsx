// app/poems/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatNextReview } from '@/lib/srs'

interface Poem {
    id: string
    title: string
    author: string
    chinese_text: string
    pinyin_text: string
    literal_translation?: string
    real_meaning: string
    literary_context?: string
    era?: string
    created_at: string
    week_number: number
    next_review: string
    review_count: number
    is_reviewed: boolean
}

type ActiveTab = 'current' | 'review' | 'archive'

export default function PoemsPage() {
    const router = useRouter()
    const [currentPoem, setCurrentPoem] = useState<Poem | null>(null)
    const [allPoems, setAllPoems] = useState<Poem[]>([])
    const [poemsToReview, setPoemsToReview] = useState<Poem[]>([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [activeTab, setActiveTab] = useState<ActiveTab>('current')
    const [selectedPoem, setSelectedPoem] = useState<Poem | null>(null)
    const [currentReviewIndex, setCurrentReviewIndex] = useState(0)
    const [revealReview, setRevealReview] = useState(false)

    useEffect(() => {
        fetchPoems()
    }, [])

    useEffect(() => {
        const now = new Date()
        const poemsDue = allPoems.filter(p => new Date(p.next_review) <= now)
        setPoemsToReview(poemsDue)
    }, [allPoems])

    async function fetchPoems() {
        try {
            setLoading(true)

            // ✅ 1. Récupérer le poème de cette semaine
            const currentWeek = Math.ceil((new Date().getDate()) / 7)

            const { data: currentData } = await supabase
                .from('poems')
                .select('*')
                .eq('week_number', currentWeek)
                .order('created_at', { ascending: false })
                .limit(1)

            if (currentData && currentData.length > 0) {
                setCurrentPoem(currentData[0])
            }

            // ✅ 2. Récupérer TOUS les poèmes
            const { data: allData } = await supabase
                .from('poems')
                .select('*')
                .order('created_at', { ascending: false })

            setAllPoems(allData || [])
        } catch (error) {
            console.error('Fetch error:', error)
        } finally {
            setLoading(false)
        }
    }

    async function generateWeekPoem() {
        try {
            setGenerating(true)
            const response = await fetch('/api/generate-poem', {
                method: 'POST',
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to generate poem')
            }

            const result = await response.json()
            if (result.poem) {
                const nextReview = new Date()
                nextReview.setDate(nextReview.getDate() + 7)

                await supabase
                    .from('poems')
                    .update({
                        next_review: nextReview.toISOString(),
                    })
                    .eq('id', result.poem.id)

                setCurrentPoem(result.poem)
                await fetchPoems()
            }
        } catch (error) {
            console.error('Generate error:', error)
            alert(error instanceof Error ? error.message : 'Error generating poem')
        } finally {
            setGenerating(false)
        }
    }

    async function recordReview(poemId: string, understood: boolean) {
        try {
            const nextReview = new Date()

            if (understood) {
                nextReview.setDate(nextReview.getDate() + 7)
            } else {
                nextReview.setDate(nextReview.getDate() + 1)
            }

            const { error } = await supabase
                .from('poems')
                .update({
                    next_review: nextReview.toISOString(),
                    review_count: poemsToReview[currentReviewIndex]?.review_count + 1 || 1,
                })
                .eq('id', poemId)

            if (error) throw error

            if (currentReviewIndex < poemsToReview.length - 1) {
                setCurrentReviewIndex(currentReviewIndex + 1)
                setRevealReview(false)
            } else {
                setActiveTab('archive')
                await fetchPoems()
            }
        } catch (error) {
            console.error('Review error:', error)
            alert('Error recording review')
        }
    }

    const handleNextReview = () => {
        if (currentReviewIndex < poemsToReview.length - 1) {
            setCurrentReviewIndex(currentReviewIndex + 1)
            setRevealReview(false)
        }
    }

    const handlePrevReview = () => {
        if (currentReviewIndex > 0) {
            setCurrentReviewIndex(currentReviewIndex - 1)
            setRevealReview(false)
        }
    }

    if (loading) {
        return (
            <div className="pb-28 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-pulse text-6xl mb-3">🎭</div>
                    <p className="text-gray-400">Loading poems...</p>
                </div>
            </div>
        )
    }

    const currentReviewPoem = poemsToReview[currentReviewIndex]

    return (
        <div className="pb-28 min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-5 pt-8 pb-6 sticky top-0 z-30">
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() => router.push('/')}
                        className="text-2xl text-gray-600 active:scale-90 transition-transform"
                    >
                        ←
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">Weekly Poems</h1>
                    <div className="w-9" />
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('current')}
                        className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all ${activeTab === 'current'
                                ? 'bg-teal-500 text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        This Week
                    </button>
                    <button
                        onClick={() => setActiveTab('review')}
                        className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all relative ${activeTab === 'review'
                                ? 'bg-teal-500 text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        Review
                        {poemsToReview.length > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {poemsToReview.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('archive')}
                        className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all ${activeTab === 'archive'
                                ? 'bg-teal-500 text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        Archive ({allPoems.length})
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="px-5 py-6">
                {/* CURRENT WEEK TAB */}
                {activeTab === 'current' && (
                    <>
                        {currentPoem ? (
                            <div className="space-y-4 animate-fade-in">
                                {/* Title Card */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-8">
                                        <div className="text-center space-y-3">
                                            <p className="text-2xl font-bold text-white">{currentPoem.title}</p>
                                            <p className="text-lg text-purple-100">— {currentPoem.author}</p>
                                            {currentPoem.era && (
                                                <p className="text-sm text-purple-200">{currentPoem.era}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Chinese Text */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                                        Chinese Text
                                    </p>
                                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                        <p className="text-center text-4xl leading-loose font-serif text-gray-900">
                                            {currentPoem.chinese_text.split('\n').map((line, i) => (
                                                <div key={i} className="mb-4">
                                                    {line}
                                                </div>
                                            ))}
                                        </p>
                                    </div>
                                </div>

                                {/* Pinyin */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                                        Pinyin
                                    </p>
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <p className="text-center text-sm leading-relaxed text-teal-600 font-medium">
                                            {currentPoem.pinyin_text.split('\n').map((line, i) => (
                                                <div key={i} className="mb-3">
                                                    {line}
                                                </div>
                                            ))}
                                        </p>
                                    </div>
                                </div>

                                {/* Literal Translation */}
                                {currentPoem.literal_translation && (
                                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                                            Literal Translation
                                        </p>
                                        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                                            <p className="text-center text-sm leading-relaxed text-blue-900 font-medium">
                                                {currentPoem.literal_translation.split('\n').map((line, i) => (
                                                    <div key={i} className="mb-3">
                                                        {line}
                                                    </div>
                                                ))}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Real Meaning */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                        Real Meaning
                                    </p>
                                    <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
                                        <p className="text-gray-800 leading-relaxed">{currentPoem.real_meaning}</p>
                                    </div>
                                </div>

                                {/* Literary Context */}
                                {currentPoem.literary_context && (
                                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                            Literary Context
                                        </p>
                                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                            <p className="text-gray-700 text-sm leading-relaxed">
                                                {currentPoem.literary_context}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Review Status */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex justify-between items-center text-sm text-gray-600">
                                        <span>
                                            📅 Next review: {formatNextReview(currentPoem.next_review)}
                                        </span>
                                        <span>🔄 {currentPoem.review_count}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 space-y-4">
                                <p className="text-gray-400">No poem generated yet this week</p>
                                <button
                                    onClick={generateWeekPoem}
                                    disabled={generating}
                                    className="bg-purple-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-600 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {generating ? '⏳ Generating...' : '✨ Generate Poem'}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* REVIEW TAB */}
                {activeTab === 'review' && (
                    <>
                        {poemsToReview.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="text-6xl mb-4">✨</div>
                                <p className="text-lg text-gray-600">No poems to review today</p>
                                <p className="text-sm text-gray-400 mt-2">
                                    Great job! Come back tomorrow for more.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                {/* Progress */}
                                <div className="text-center text-sm text-gray-500">
                                    {currentReviewIndex + 1} / {poemsToReview.length}
                                </div>

                                {/* Review Card */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-8">
                                        <div className="text-center space-y-2">
                                            <p className="text-purple-100 text-sm font-semibold uppercase tracking-wide">
                                                Reviewing
                                            </p>
                                            <p className="text-2xl font-bold text-white">
                                                {currentReviewPoem?.title}
                                            </p>
                                            <p className="text-purple-100">— {currentReviewPoem?.author}</p>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-4">
                                        {!revealReview ? (
                                            <button
                                                onClick={() => setRevealReview(true)}
                                                className="w-full bg-gray-50 hover:bg-gray-100 rounded-2xl p-12 border border-gray-200 transition-all active:scale-95"
                                            >
                                                <p className="text-4xl mb-3">🔒</p>
                                                <p className="text-gray-600 font-semibold">
                                                    Tap to reveal the poem
                                                </p>
                                            </button>
                                        ) : (
                                            <>
                                                {/* Chinese Text */}
                                                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                                    <p className="text-center text-3xl leading-loose font-serif text-gray-900">
                                                        {currentReviewPoem?.chinese_text
                                                            .split('\n')
                                                            .map((line, i) => (
                                                                <div key={i} className="mb-3">
                                                                    {line}
                                                                </div>
                                                            ))}
                                                    </p>
                                                </div>

                                                {/* Pinyin */}
                                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                                    <p className="text-center text-xs text-teal-600 leading-relaxed">
                                                        {currentReviewPoem?.pinyin_text
                                                            .split('\n')
                                                            .map((line, i) => (
                                                                <div key={i} className="mb-1">
                                                                    {line}
                                                                </div>
                                                            ))}
                                                    </p>
                                                </div>

                                                {/* Literal Translation */}
                                                {currentReviewPoem?.literal_translation && (
                                                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                                                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                                                            Literal Translation
                                                        </p>
                                                        <p className="text-gray-800 text-sm leading-relaxed">
                                                            {currentReviewPoem.literal_translation}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Real Meaning */}
                                                <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
                                                    <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                                                        Real Meaning
                                                    </p>
                                                    <p className="text-gray-800 text-sm leading-relaxed">
                                                        {currentReviewPoem?.real_meaning}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                {revealReview && (
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() =>
                                                recordReview(currentReviewPoem!.id, false)
                                            }
                                            className="flex-1 bg-red-100 text-red-700 py-4 rounded-2xl font-semibold hover:bg-red-200 active:scale-95 transition-all"
                                        >
                                            ❌ Need to learn
                                        </button>
                                        <button
                                            onClick={() =>
                                                recordReview(currentReviewPoem!.id, true)
                                            }
                                            className="flex-1 bg-teal-500 text-white py-4 rounded-2xl font-semibold hover:bg-teal-600 active:scale-95 transition-all"
                                        >
                                            ✓ Got It
                                        </button>
                                    </div>
                                )}

                                {/* Navigation */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handlePrevReview}
                                        disabled={currentReviewIndex === 0}
                                        className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-30 active:scale-95 transition-all"
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={handleNextReview}
                                        disabled={
                                            currentReviewIndex ===
                                            poemsToReview.length - 1
                                        }
                                        className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-30 active:scale-95 transition-all"
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ARCHIVE TAB */}
                {activeTab === 'archive' && (
                    <div className="space-y-3">
                        {allPoems.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                No poems yet
                            </div>
                        ) : (
                            allPoems.map((poem) => (
                                <div key={poem.id} className="space-y-0">
                                    {/* Main Card */}
                                    <div
                                        onClick={() =>
                                            setSelectedPoem(
                                                selectedPoem?.id === poem.id
                                                    ? null
                                                    : poem
                                            )
                                        }
                                        className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-all cursor-pointer"
                                    >
                                        {/* Top Row */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex-1">
                                                <p className="text-xl font-bold text-gray-900">
                                                    {poem.title}
                                                </p>
                                                <p className="text-purple-600 text-sm font-medium mt-0.5">
                                                    — {poem.author}
                                                </p>
                                            </div>
                                            {poem.era && (
                                                <span className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ml-3 bg-purple-100 text-purple-700">
                                                    {poem.era}
                                                </span>
                                            )}
                                        </div>

                                        {/* Stats */}
                                        <div className="flex justify-between items-center text-xs text-gray-500 border-t border-gray-200 pt-3">
                                            <div className="flex gap-4">
                                                <span>🔄 {poem.review_count}</span>
                                                <span>
                                                    📅{' '}
                                                    {new Date(
                                                        poem.created_at
                                                    ).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <span
                                                className={`font-semibold ${new Date(poem.next_review) <=
                                                        new Date()
                                                        ? 'text-red-600'
                                                        : 'text-gray-500'
                                                    }`}
                                            >
                                                {formatNextReview(
                                                    poem.next_review
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {selectedPoem?.id === poem.id && (
                                        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3 animate-fade-in">
                                            {/* Chinese */}
                                            <div>
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                    Chinese Text
                                                </p>
                                                <p className="text-gray-900 text-lg leading-relaxed font-serif">
                                                    {poem.chinese_text
                                                        .split('\n')
                                                        .map((line, i) => (
                                                            <div
                                                                key={i}
                                                                className="mb-2"
                                                            >
                                                                {line}
                                                            </div>
                                                        ))}
                                                </p>
                                            </div>

                                            {/* Pinyin */}
                                            <div>
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                    Pinyin
                                                </p>
                                                <p className="text-teal-600 text-sm font-medium leading-relaxed">
                                                    {poem.pinyin_text
                                                        .split('\n')
                                                        .map((line, i) => (
                                                            <div
                                                                key={i}
                                                                className="mb-1"
                                                            >
                                                                {line}
                                                            </div>
                                                        ))}
                                                </p>
                                            </div>

                                            {/* Literal Translation */}
                                            {poem.literal_translation && (
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                        Literal Translation
                                                    </p>
                                                    <p className="text-gray-700 text-sm leading-relaxed bg-blue-50 rounded-lg p-3 border border-blue-100">
                                                        {poem.literal_translation
                                                            .split('\n')
                                                            .map(
                                                                (line, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="mb-1"
                                                                    >
                                                                        {line}
                                                                    </div>
                                                                )
                                                            )}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Real Meaning */}
                                            <div>
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                    Real Meaning
                                                </p>
                                                <p className="text-gray-700 text-sm leading-relaxed bg-purple-50 rounded-lg p-3 border border-purple-100">
                                                    {poem.real_meaning}
                                                </p>
                                            </div>

                                            {/* Context */}
                                            {poem.literary_context && (
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                        Literary Context
                                                    </p>
                                                    <p className="text-gray-600 text-sm leading-relaxed">
                                                        {poem.literary_context}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
