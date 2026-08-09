// app/study/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Flashcard } from '@/types'
import { calculateSRS, getPriority } from '@/lib/srs'

const STATS_CACHE_KEY = 'app_stats_v2'

export default function StudyPage() {
    const router = useRouter()
    const [cards, setCards] = useState<Flashcard[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [revealed, setRevealed] = useState(false)
    const [loading, setLoading] = useState(true)
    const [done, setDone] = useState(false)
    const [sessionStats, setSessionStats] = useState({ forgot: 0, almost: 0, gotIt: 0, total: 0 })
    const [saving, setSaving] = useState(false)
    const [showFeedback, setShowFeedback] = useState<'correct' | 'wrong' | null>(null)

    useEffect(() => {
        fetchDueCards()
    }, [])

    async function fetchDueCards() {
        const now = new Date().toISOString()
        const { data, error } = await supabase
            .from('flashcards')
            .select('*')
            .or(`next_review.lte.${now},phase.eq.learning`)
            .neq('phase', 'new') // Pas les cartes jamais vues
            .order('next_review', { ascending: true })
            .limit(30)

        if (error) { console.error(error); setLoading(false); return }

        if (!data || data.length === 0) {
            setDone(true)
            setLoading(false)
            return
        }

        // Trie par priorité
        const sorted = [...data].sort((a, b) => getPriority(b) - getPriority(a))
        setCards(sorted)
        setLoading(false)
    }

    const currentCard = cards[currentIndex]

    async function handleGrade(grade: 0 | 1 | 2) {
        if (!currentCard || saving) return
        setSaving(true)

        // Feedback visuel
        setShowFeedback(grade === 2 ? 'correct' : 'wrong')
        setTimeout(() => setShowFeedback(null), 600)

        // Calcul SRS
        const result = calculateSRS(grade, {
            ease_factor: currentCard.ease_factor,
            interval_days: currentCard.interval_days,
            repetitions: currentCard.repetitions,
            correct_streak: currentCard.correct_streak,
            wrong_streak: currentCard.wrong_streak,
            phase: currentCard.phase,
        })

        // Update stats session
        const newStats = { ...sessionStats }
        newStats.total++
        if (grade === 0) newStats.forgot++
        else if (grade === 1) newStats.almost++
        else newStats.gotIt++
        setSessionStats(newStats)

        // Sauvegarde Supabase
        await supabase.from('flashcards').update({
            phase: result.phase,
            ease_factor: result.ease_factor,
            interval_days: result.interval_days,
            repetitions: result.repetitions,
            correct_streak: result.correct_streak,
            wrong_streak: result.wrong_streak,
            next_review: result.next_review.toISOString(),
        }).eq('id', currentCard.id)

        // Update streak si premier study du jour
        const today = new Date().toISOString().split('T')[0]
        const streakData = JSON.parse(localStorage.getItem('streak_data') || '{"streak":0,"lastDate":""}')
        if (streakData.lastDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
            const newStreak = streakData.lastDate === yesterday ? streakData.streak + 1 : 1
            localStorage.setItem('streak_data', JSON.stringify({ streak: newStreak, lastDate: today }))
        }

        // Si carte oubliée, la remet plus tard dans la file
        let newCards = [...cards]
        if (grade === 0) {
            const forgotCard = { ...currentCard, ...result, next_review: result.next_review.toISOString() }
            newCards = [...newCards.filter((_, i) => i !== currentIndex), forgotCard]
            setCards(newCards)
            setCurrentIndex(currentIndex) // Reste au même index (prochain card)
        } else {
            // Passe à la suivante
            if (currentIndex >= cards.length - 1) {
                // Fin de session
                localStorage.removeItem(STATS_CACHE_KEY)
                setDone(true)
                setSaving(false)
                return
            }
            setCurrentIndex(currentIndex + 1)
        }

        setRevealed(false)
        setSaving(false)
    }

    // ── LOADING ──
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-5xl animate-pulse">📚</div>
            </div>
        )
    }

    // ── DONE ──
    if (done) {
        const accuracy = sessionStats.total > 0
            ? Math.round((sessionStats.gotIt / sessionStats.total) * 100)
            : 0

        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm text-center">
                    <div className="text-6xl mb-4">
                        {accuracy >= 80 ? '🏆' : accuracy >= 60 ? '⭐' : '📖'}
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">
                        {sessionStats.total === 0 ? 'All caught up!' : 'Session done!'}
                    </h2>

                    {sessionStats.total === 0 ? (
                        <p className="text-gray-400 mb-8">No cards due right now. Come back later!</p>
                    ) : (
                        <>
                            <p className="text-gray-400 mb-6">{sessionStats.total} cards reviewed</p>

                            <div className="grid grid-cols-3 gap-3 mb-8">
                                <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                                    <p className="text-2xl font-bold text-green-600">{sessionStats.gotIt}</p>
                                    <p className="text-xs text-green-500">Got it</p>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4">
                                    <p className="text-2xl font-bold text-yellow-600">{sessionStats.almost}</p>
                                    <p className="text-xs text-yellow-500">Almost</p>
                                </div>
                                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                                    <p className="text-2xl font-bold text-red-500">{sessionStats.forgot}</p>
                                    <p className="text-xs text-red-400">Forgot</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-6">
                                <p className="text-sm text-gray-400 mb-1">Accuracy</p>
                                <p className="text-3xl font-bold text-gray-900">{accuracy}%</p>
                                <div className="mt-2 bg-gray-100 rounded-full h-2">
                                    <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${accuracy}%` }} />
                                </div>
                            </div>
                        </>
                    )}

                    <button
                        onClick={() => router.push('/')}
                        className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
                    >
                        Back to Home 🏠
                    </button>
                    <button
                        onClick={() => router.push('/lesson')}
                        className="w-full mt-3 bg-white border border-gray-200 text-gray-600 py-3.5 rounded-2xl font-semibold active:scale-95 transition-transform"
                    >
                        Do a lesson instead →
                    </button>
                </div>
            </div>
        )
    }

    // ── SESSION ──
    const totalDue = cards.length
    const progress = (currentIndex / totalDue) * 100

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 pt-10 pb-8">

            {/* Feedback overlay */}
            {showFeedback && (
                <div className={`fixed inset-0 pointer-events-none flex items-center justify-center z-50 transition-opacity
          ${showFeedback === 'correct' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <div className={`text-6xl animate-bounce`}>
                        {showFeedback === 'correct' ? '✅' : '❌'}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="w-full max-w-sm flex items-center justify-between mb-4">
                <button onClick={() => router.push('/')} className="text-gray-400 text-sm">← Back</button>
                <span className="text-sm font-semibold text-gray-700">📚 Review</span>
                <span className="text-sm text-gray-400">{currentIndex + 1}/{totalDue}</span>
            </div>

            {/* Progress */}
            <div className="w-full max-w-sm bg-gray-200 rounded-full h-1.5 mb-3">
                <div
                    className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                />
            </div>

            {/* Phase badge */}
            <div className="w-full max-w-sm flex justify-end mb-5">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium
          ${currentCard?.phase === 'mastered' ? 'bg-green-100 text-green-600'
                        : currentCard?.phase === 'reviewing' ? 'bg-yellow-100 text-yellow-600'
                            : 'bg-blue-100 text-blue-600'}`}>
                    {currentCard?.phase}
                </span>
            </div>

            {/* Card */}
            <div className="w-full max-w-sm flex-1">
                <div
                    className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center mb-6 min-h-64 flex flex-col items-center justify-center
            ${!revealed ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
                    onClick={!revealed ? () => setRevealed(true) : undefined}
                >
                    {/* Character */}
                    <div className="text-8xl font-bold text-gray-900 mb-4">{currentCard?.character}</div>

                    {!revealed ? (
                        <p className="text-gray-300 text-sm">Tap to reveal</p>
                    ) : (
                        <div className="w-full animate-fade-in">
                            <div className="h-px bg-gray-100 mb-4" />
                            <p className="text-xl text-blue-500 font-medium mb-2">{currentCard?.pinyin}</p>
                            <p className="text-base font-semibold text-gray-800 mb-1">{currentCard?.definition}</p>
                            {currentCard?.translation && (
                                <p className="text-sm text-gray-400 italic mb-3">{currentCard.translation}</p>
                            )}

                            {/* Next review preview */}
                            <div className="mt-4 text-xs text-gray-300">
                                Interval: {currentCard?.interval_days}d • EF: {currentCard?.ease_factor?.toFixed(1)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Audio button */}
                {revealed && currentCard?.audio_url && (
                    <button
                        onClick={() => new Audio(currentCard.audio_url!).play()}
                        className="w-full max-w-sm bg-gray-100 text-gray-600 py-3 rounded-2xl font-medium text-sm mb-4 active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                        🔊 Listen to pronunciation
                    </button>
                )}

                {/* Grade buttons */}
                {revealed && !saving && (
                    <div className="flex gap-3 w-full max-w-sm">
                        <button
                            onClick={() => handleGrade(0)}
                            className="flex-1 bg-red-50 border border-red-100 text-red-500 py-4 rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex flex-col items-center gap-1"
                        >
                            <span className="text-xl">😕</span>
                            <span>Forgot</span>
                        </button>
                        <button
                            onClick={() => handleGrade(1)}
                            className="flex-1 bg-yellow-50 border border-yellow-100 text-yellow-600 py-4 rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex flex-col items-center gap-1"
                        >
                            <span className="text-xl">🤔</span>
                            <span>Almost</span>
                        </button>
                        <button
                            onClick={() => handleGrade(2)}
                            className="flex-1 bg-green-50 border border-green-100 text-green-600 py-4 rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex flex-col items-center gap-1"
                        >
                            <span className="text-xl">✅</span>
                            <span>Got it!</span>
                        </button>
                    </div>
                )}

                {/* Saving indicator */}
                {saving && (
                    <div className="flex justify-center mt-4">
                        <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {/* Examples (revealed) */}
                {revealed && currentCard?.examples && currentCard.examples.length > 0 && (
                    <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Example</p>
                        <div className="space-y-1">
                            <p className="text-gray-800 font-medium">{currentCard.examples[0].chinese}</p>
                            <p className="text-blue-400 text-sm">{currentCard.examples[0].pinyin}</p>
                            <p className="text-gray-400 text-sm">{currentCard.examples[0].french}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

