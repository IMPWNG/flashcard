// app/idioms/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatNextReview } from '@/lib/srs'

interface Idiom {
    id: string
    chinese: string
    pinyin: string
    french_translation: string
    english_translation?: string
    meaning: string
    example_sentence: string
    example_pinyin: string
    example_french: string
    ai_explanation?: string
    created_at: string
    phase: string
    next_review: string
    review_count: number
}

type ActiveTab = 'today' | 'history' | 'review'

export default function IdiomsPage() {
    const router = useRouter()
    const [todayIdiom, setTodayIdiom] = useState<Idiom | null>(null)
    const [allIdioms, setAllIdioms] = useState<Idiom[]>([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [activeTab, setActiveTab] = useState<ActiveTab>('today')
    const [selectedIdiom, setSelectedIdiom] = useState<Idiom | null>(null)
    const [reviewIdioms, setReviewIdioms] = useState<Idiom[]>([])
    const [currentReviewIndex, setCurrentReviewIndex] = useState(0)
    const [revealReview, setRevealReview] = useState(false)

    useEffect(() => {
        fetchIdioms()
    }, [])

    // ✅ Mettre à jour les idioms à réviser quand les données changent
    useEffect(() => {
        const now = new Date()
        const idiomsDue = allIdioms.filter(i => new Date(i.next_review) <= now)
        setReviewIdioms(idiomsDue)
    }, [allIdioms])

    async function fetchIdioms() {
        try {
            setLoading(true)

            // ✅ 1. Récupérer l'idiom d'aujourd'hui
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const { data: todayData } = await supabase
                .from('idioms')
                .select('*')
                .gte('created_at', today.toISOString())
                .order('created_at', { ascending: false })
                .limit(1)

            if (todayData && todayData.length > 0) {
                setTodayIdiom(todayData[0])
            }

            // ✅ 2. Récupérer tous les idioms
            const { data: allData } = await supabase
                .from('idioms')
                .select('*')
                .order('created_at', { ascending: false })

            setAllIdioms(allData || [])
        } catch (error) {
            console.error('Fetch error:', error)
        } finally {
            setLoading(false)
        }
    }

    async function generateTodayIdiom() {
        try {
            setGenerating(true)
            const response = await fetch('/api/generate-idiom', {
                method: 'POST',
            })

            const result = await response.json()
            if (result.idiom) {
                setTodayIdiom(result.idiom)
                await fetchIdioms()
            }
        } catch (error) {
            console.error('Generate error:', error)
            alert('Error generating idiom')
        } finally {
            setGenerating(false)
        }
    }

    // ✅ Incrémenter review_count
    async function incrementReview(idiomId: string) {
        try {
            const { data: idiom } = await supabase
                .from('idioms')
                .select('review_count, phase')
                .eq('id', idiomId)
                .single()

            if (!idiom) return

            const newPhase =
                (idiom.review_count || 0) >= 9 ? 'mastered' :
                    (idiom.review_count || 0) >= 4 ? 'reviewing' :
                        'learning'

            const nextReview = new Date()
            nextReview.setDate(nextReview.getDate() + 5)

            await supabase
                .from('idioms')
                .update({
                    last_reviewed: new Date().toISOString(),
                    next_review: nextReview.toISOString(),
                    review_count: (idiom.review_count || 0) + 1,
                    phase: newPhase,
                })
                .eq('id', idiomId)

            await fetchIdioms()
        } catch (error) {
            console.error('Increment error:', error)
        }
    }

    // ✅ Décrémenter review_count
    async function decrementReview(idiomId: string) {
        try {
            const { data: idiom } = await supabase
                .from('idioms')
                .select('review_count')
                .eq('id', idiomId)
                .single()

            if (!idiom || (idiom.review_count || 0) <= 0) return

            const newCount = Math.max(0, (idiom.review_count || 0) - 1)
            const newPhase =
                newCount >= 9 ? 'mastered' :
                    newCount >= 4 ? 'reviewing' :
                        'learning'

            const nextReview = new Date()
            nextReview.setDate(nextReview.getDate() + 5)

            await supabase
                .from('idioms')
                .update({
                    review_count: newCount,
                    phase: newPhase,
                    next_review: nextReview.toISOString(),
                })
                .eq('id', idiomId)

            await fetchIdioms()
        } catch (error) {
            console.error('Decrement error:', error)
        }
    }

    // ✅ Passer à l'idiom suivant en révision
    const handleNextReview = () => {
        if (currentReviewIndex < reviewIdioms.length - 1) {
            setCurrentReviewIndex(currentReviewIndex + 1)
            setRevealReview(false)
        }
    }

    // ✅ Retour à l'idiom précédent en révision
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
                    <div className="animate-pulse text-6xl mb-3">🀄</div>
                    <p className="text-gray-400">Loading idioms...</p>
                </div>
            </div>
        )
    }

    const currentReviewIdiom = reviewIdioms[currentReviewIndex]

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
                    <h1 className="text-2xl font-bold text-gray-900">Chinese Idioms</h1>
                    <div className="w-9" />
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('today')}
                        className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all ${activeTab === 'today'
                            ? 'bg-teal-500 text-white'
                            : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('review')
                            setCurrentReviewIndex(0)
                            setRevealReview(false)
                        }}
                        className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all relative ${activeTab === 'review'
                            ? 'bg-teal-500 text-white'
                            : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        Review
                        {reviewIdioms.length > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {reviewIdioms.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all ${activeTab === 'history'
                            ? 'bg-teal-500 text-white'
                            : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        History ({allIdioms.length})
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="px-5 py-6">
                {/* TODAY TAB */}
                {activeTab === 'today' && (
                    <>
                        {todayIdiom ? (
                            <div className="space-y-4 animate-fade-in">
                                {/* Main Card */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-6 py-8">
                                        <div className="text-center space-y-3">
                                            <p className="text-6xl font-bold text-white">{todayIdiom.chinese}</p>
                                            <p className="text-lg text-teal-100">{todayIdiom.pinyin}</p>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-5">
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Literal Translation</p>
                                            <p className="text-xl font-semibold text-gray-900">{todayIdiom.french_translation}</p>
                                        </div>

                                        <div className="bg-teal-50 rounded-2xl p-4 border border-teal-100">
                                            <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Real Meaning</p>
                                            <p className="text-gray-800 leading-relaxed">{todayIdiom.meaning}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Example Card */}
                                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Example Usage</p>
                                    <div className="space-y-3 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <div>
                                            <p className="font-semibold text-gray-900">{todayIdiom.example_sentence}</p>
                                            <p className="text-teal-600 text-sm mt-2 font-medium">{todayIdiom.example_pinyin}</p>
                                        </div>
                                        <p className="text-gray-600 text-sm italic leading-relaxed">
                                            "{todayIdiom.example_french}"
                                        </p>
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => decrementReview(todayIdiom.id)}
                                        className="flex-1 bg-red-100 text-red-700 py-4 rounded-2xl font-semibold hover:bg-red-200 active:scale-95 transition-all"
                                    >
                                        ➖ Need to learn
                                    </button>
                                    <button
                                        onClick={() => incrementReview(todayIdiom.id)}
                                        className="flex-1 bg-teal-500 text-white py-4 rounded-2xl font-semibold hover:bg-teal-600 active:scale-95 transition-all"
                                    >
                                        ✓ Got It
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 space-y-4">
                                <p className="text-gray-400">No idiom generated yet today</p>
                                <button
                                    onClick={generateTodayIdiom}
                                    disabled={generating}
                                    className="bg-teal-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-teal-600 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {generating ? '⏳ Generating...' : '✨ Generate Today\'s Idiom'}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* REVIEW TAB */}
                {activeTab === 'review' && (
                    <>
                        {reviewIdioms.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="text-6xl mb-4">✨</div>
                                <p className="text-lg text-gray-600">No idioms to review today</p>
                                <p className="text-sm text-gray-400 mt-2">Great job! Come back tomorrow for more.</p>
                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in">
                                {/* Progress */}
                                <div className="text-center text-sm text-gray-500">
                                    {currentReviewIndex + 1} / {reviewIdioms.length}
                                </div>

                                {/* Review Card */}
                                <div
                                    onClick={() => setRevealReview(!revealReview)}
                                    className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-3xl shadow-lg border border-teal-400 overflow-hidden min-h-96 flex items-center justify-center cursor-pointer hover:shadow-xl transition-shadow"
                                >
                                    <div className="text-center p-8">
                                        {!revealReview ? (
                                            <div className="space-y-4">
                                                <p className="text-8xl font-bold text-white drop-shadow-lg">
                                                    {currentReviewIdiom?.chinese}
                                                </p>
                                                <p className="text-lg text-teal-50 font-medium">
                                                    {currentReviewIdiom?.pinyin}
                                                </p>
                                                <p className="text-sm text-teal-100 mt-6">Tap to reveal</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <p className="text-8xl font-bold text-white drop-shadow-lg">
                                                    {currentReviewIdiom?.chinese}
                                                </p>
                                                <div className="space-y-3 text-left bg-white/10 rounded-2xl p-6 backdrop-blur-sm">
                                                    <div>
                                                        <p className="text-xs text-teal-100 font-semibold uppercase tracking-wide">Literal</p>
                                                        <p className="text-xl font-bold text-white">{currentReviewIdiom?.french_translation}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-teal-100 font-semibold uppercase tracking-wide">Meaning</p>
                                                        <p className="text-base text-white">{currentReviewIdiom?.meaning}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Review Action Buttons */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            decrementReview(currentReviewIdiom!.id)
                                            handleNextReview()
                                        }}
                                        className="flex-1 bg-red-100 text-red-700 py-4 rounded-2xl font-bold hover:bg-red-200 active:scale-95 transition-all"
                                    >
                                        ➖ Hard
                                    </button>
                                    <button
                                        onClick={() => {
                                            incrementReview(currentReviewIdiom!.id)
                                            handleNextReview()
                                        }}
                                        className="flex-1 bg-teal-500 text-white py-4 rounded-2xl font-bold hover:bg-teal-600 active:scale-95 transition-all"
                                    >
                                        ✓ Easy
                                    </button>
                                </div>

                                {/* Navigation */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handlePrevReview}
                                        disabled={currentReviewIndex === 0}
                                        className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300 disabled:opacity-30 active:scale-95 transition-all"
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        onClick={handleNextReview}
                                        disabled={currentReviewIndex === reviewIdioms.length - 1}
                                        className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-300 disabled:opacity-30 active:scale-95 transition-all"
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* HISTORY TAB */}
                {activeTab === 'history' && (
                    <div className="space-y-3">
                        {allIdioms.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                No idioms yet
                            </div>
                        ) : (
                            allIdioms.map((idiom) => (
                                <div key={idiom.id} className="space-y-0">
                                    {/* Main Card */}
                                    <div
                                        onClick={() => setSelectedIdiom(selectedIdiom?.id === idiom.id ? null : idiom)}
                                        className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-all cursor-pointer"
                                    >
                                        {/* Top Row */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex-1">
                                                <p className="text-2xl font-bold text-gray-900">{idiom.chinese}</p>
                                                <p className="text-teal-600 text-sm font-medium mt-0.5">{idiom.pinyin}</p>
                                            </div>
                                            <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ml-3 ${idiom.phase === 'mastered' ? 'bg-green-100 text-green-700' :
                                                idiom.phase === 'reviewing' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {idiom.phase}
                                            </span>
                                        </div>

                                        {/* Translation */}
                                        <p className="text-gray-700 text-sm mb-3">{idiom.french_translation}</p>

                                        {/* Stats */}
                                        <div className="flex justify-between items-center text-xs text-gray-500 border-t border-gray-200 pt-3">
                                            <div className="flex gap-4">
                                                <span>🔄 {idiom.review_count}</span>
                                                <span>📅 {new Date(idiom.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <span className={`font-semibold ${new Date(idiom.next_review) <= new Date() ? 'text-red-600' : 'text-gray-500'}`}>
                                                {formatNextReview(idiom.next_review)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
                                    {selectedIdiom?.id === idiom.id && (
                                        <div className="bg-teal-50 border border-t-0 border-gray-100 rounded-b-2xl p-4 space-y-4 animate-fade-in">
                                            <div>
                                                <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Real Meaning</p>
                                                <p className="text-gray-800 text-sm leading-relaxed">{idiom.meaning}</p>
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Example</p>
                                                <div className="bg-white rounded-xl p-3 space-y-2 border border-gray-200">
                                                    <p className="font-medium text-gray-900 text-sm">{idiom.example_sentence}</p>
                                                    <p className="text-teal-600 text-xs font-medium">{idiom.example_pinyin}</p>
                                                    <p className="text-gray-600 text-xs italic">"{idiom.example_french}"</p>
                                                </div>
                                            </div>

                                            {/* Increment/Decrement */}
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        decrementReview(idiom.id)
                                                    }}
                                                    className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg font-semibold text-sm hover:bg-red-200 active:scale-95 transition-all"
                                                >
                                                    ➖
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        incrementReview(idiom.id)
                                                    }}
                                                    className="flex-1 bg-teal-500 text-white py-2 rounded-lg font-semibold text-sm hover:bg-teal-600 active:scale-95 transition-all"
                                                >
                                                    ✓
                                                </button>
                                            </div>
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
