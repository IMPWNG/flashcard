// app/lesson/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Flashcard } from '@/types'
import { calculateSRS } from '@/lib/srs'

const CARDS_PER_LESSON = 10
const STATS_CACHE_KEY = 'app_stats_v2'

type LessonPhase = 'intro' | 'learn' | 'quiz' | 'results'
type CardState = 'hidden' | 'revealed'

interface LessonCard extends Flashcard {
    quizGrade: 0 | 1 | 2 | null
}

export default function LessonPage() {
    const router = useRouter()
    const [phase, setPhase] = useState<LessonPhase>('intro')
    const [cards, setCards] = useState<LessonCard[]>([])
    const [lessonNumber, setLessonNumber] = useState(1)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [cardState, setCardState] = useState<CardState>('hidden')
    const [loading, setLoading] = useState(true)
    const [noCards, setNoCards] = useState(false)

    // Quiz state
    const [quizCards, setQuizCards] = useState<LessonCard[]>([])
    const [quizIndex, setQuizIndex] = useState(0)
    const [quizRevealed, setQuizRevealed] = useState(false)
    const [quizResults, setQuizResults] = useState<(0 | 1 | 2)[]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        loadLesson()
    }, [])

    const loadLesson = useCallback(async () => {
        try {
            // Compte les leçons déjà complétées
            const { count: completedCount } = await supabase
                .from('lesson_progress')
                .select('*', { count: 'exact', head: true })
                .eq('completed', true)

            const nextLessonNum = (completedCount ?? 0) + 1
            setLessonNumber(nextLessonNum)

            // 🔧 DEBUG : Voir TOUTES les cartes
            const { data: allCards, error: allError } = await supabase
                .from('flashcards')
                .select('*')

            console.log('✅ Toutes les cartes:', allCards)
            console.log('Nombre total:', allCards?.length)
            if (allCards && allCards.length > 0) {
                console.log('PHASES DES CARTES:')
                allCards.slice(0, 5).forEach(c => {
                    console.log(`  ${c.character} - phase: "${c.phase}" - lesson_date: ${c.lesson_date}`)
                })
            }

            // 🔧 Maintenant la vraie requête
            const { data, error } = await supabase
                .from('flashcards')
                .select('*')
                .eq('phase', 'new')
                .order('created_at', { ascending: true })
                .limit(CARDS_PER_LESSON)

            console.log('📚 Cartes en phase new:', data)
            console.log('Erreur:', error)

            if (error) throw error

            if (!data || data.length === 0) {
                console.log('❌ Pas de cartes trouvées!')
                setNoCards(true)
                setLoading(false)
                return
            }

            // Marque les cartes comme assignées
            const today = new Date().toISOString().split('T')[0]
            const ids = data.map(c => c.id)

            await supabase
                .from('flashcards')
                .update({ lesson_date: today, lesson_unlocked: true })
                .in('id', ids)

            const lessonCards: LessonCard[] = data.map(c => ({ ...c, quizGrade: null }))
            setCards(lessonCards)
            console.log('✅ Leçon chargée:', lessonCards.length, 'cartes')
        } catch (err) {
            console.error('❌ Erreur loadLesson:', err)
        } finally {
            setLoading(false)
        }
    }, [])



    // ── Helpers ──
    const currentCard = cards[currentIndex]
    const currentQuizCard = quizCards[quizIndex]

    function revealCard() {
        setCardState('revealed')
    }

    function nextLearnCard() {
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(currentIndex + 1)
            setCardState('hidden')
        } else {
            // Fin de la phase learn → Quiz
            // Mélange les cartes pour le quiz
            const shuffled = [...cards].sort(() => Math.random() - 0.5)
            setQuizCards(shuffled)
            setQuizIndex(0)
            setQuizRevealed(false)
            setQuizResults([])
            setPhase('quiz')
        }
    }

    async function handleQuizGrade(grade: 0 | 1 | 2) {
        if (saving) return

        const newResults = [...quizResults, grade]
        setQuizResults(newResults)

        if (quizIndex < quizCards.length - 1) {
            // Carte suivante
            setQuizIndex(quizIndex + 1)
            setQuizRevealed(false)
        } else {
            // Fin du quiz → Sauvegarde
            setSaving(true)
            await saveQuizResults(newResults)
        }
    }

    async function saveQuizResults(results: (0 | 1 | 2)[]) {
        try {
            const today = new Date().toISOString().split('T')[0]

            // Update chaque carte avec SRS initial basé sur la note
            const updates = quizCards.map((card, i) => {
                const grade = results[i]
                const srsResult = calculateSRS(grade, {
                    ease_factor: card.ease_factor ?? 2.5,
                    interval_days: 0,
                    repetitions: 0,
                    correct_streak: 0,
                    wrong_streak: 0,
                    phase: 'new',
                })

                return supabase.from('flashcards').update({
                    phase: srsResult.phase,
                    ease_factor: srsResult.ease_factor,
                    interval_days: srsResult.interval_days,
                    repetitions: srsResult.repetitions,
                    correct_streak: srsResult.correct_streak,
                    wrong_streak: srsResult.wrong_streak,
                    next_review: srsResult.next_review.toISOString(),
                    lesson_date: today,
                    lesson_unlocked: true,
                }).eq('id', card.id)
            })

            await Promise.all(updates)

            // Enregistre la leçon complétée
            const score = Math.round((results.filter(r => r === 2).length / results.length) * 100)
            await supabase.from('lesson_progress').insert({
                lesson_number: lessonNumber,
                completed_date: today,
                cards_count: quizCards.length,
                score,
            })

            // ✅ UPDATE STREAK EN DB (pas juste localStorage)
            const streakData = JSON.parse(localStorage.getItem('streak_data') || '{"streak":0,"lastDate":""}')
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

            let newStreak = streakData.streak
            if (streakData.lastDate !== today) {
                newStreak = streakData.lastDate === yesterday ? streakData.streak + 1 : 1
            }

            // Sauvegarde en DB
            await supabase
                .from('streak_data')
                .upsert(
                    { user_id: (await supabase.auth.getUser()).data.user?.id, streak: newStreak, last_activity_date: today },
                    { onConflict: 'user_id' }
                )

            // Sauvegarde aussi en localStorage pour la synchro
            localStorage.setItem('streak_data', JSON.stringify({ streak: newStreak, lastDate: today }))

            // Invalide cache stats
            localStorage.removeItem(STATS_CACHE_KEY)

            setPhase('results')
        } catch (err) {
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    // ── LOADING ──
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Preparing lesson...</p>
                </div>
            </div>
        )
    }

    // ── NO CARDS ──
    if (noCards) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm text-center">
                    <div className="text-6xl mb-4">📭</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">No new cards!</h2>
                    <p className="text-gray-400 mb-8">
                        Add more flashcards to continue learning new characters.
                    </p>
                    <button
                        onClick={() => router.push('/add')}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform mb-3"
                    >
                        ➕ Add new cards
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full bg-white border border-gray-200 text-gray-600 py-3.5 rounded-2xl font-semibold active:scale-95 transition-transform"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        )
    }

    // ── INTRO ──
    if (phase === 'intro') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg shadow-purple-200">
                            🎓
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-1">Lesson {lessonNumber}</h1>
                        <p className="text-gray-400">Learn {cards.length} new characters</p>
                    </div>

                    {/* Steps */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 mb-6 space-y-4">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">How it works</h2>
                        {[
                            { icon: '👁️', title: 'Study', desc: `Review all ${cards.length} characters one by one` },
                            { icon: '🧠', title: 'Quiz', desc: 'Test yourself on everything you just saw' },
                            { icon: '🔄', title: 'SRS', desc: 'Cards enter your spaced repetition queue' },
                        ].map(({ icon, title, desc }) => (
                            <div key={title} className="flex items-start gap-3">
                                <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                                    {icon}
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-800 text-sm">{title}</p>
                                    <p className="text-gray-400 text-xs">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Cards preview */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 mb-6">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                            Characters in this lesson
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {cards.map(card => (
                                <div key={card.id} className="bg-gray-50 rounded-xl px-3 py-1.5 text-center">
                                    <span className="text-xl font-bold text-gray-900">{card.character}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => setPhase('learn')}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-purple-200 active:scale-95 transition-transform"
                    >
                        Start Lesson →
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full mt-3 text-gray-400 text-sm py-2"
                    >
                        Maybe later
                    </button>
                </div>
            </div>
        )
    }

    // ── LEARN ──
    if (phase === 'learn') {
        const learnProgress = ((currentIndex + (cardState === 'revealed' ? 0.5 : 0)) / cards.length) * 100

        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 pt-10 pb-8">
                {/* Header */}
                <div className="w-full max-w-sm flex items-center justify-between mb-4">
                    <button
                        onClick={() => phase === 'learn' && currentIndex === 0 ? setPhase('intro') : (setCurrentIndex(Math.max(0, currentIndex - 1)), setCardState('hidden'))}
                        className="text-gray-400 text-sm"
                    >
                        ← Back
                    </button>
                    <span className="text-sm font-semibold text-gray-700">🎓 Lesson {lessonNumber}</span>
                    <span className="text-sm text-gray-400">{currentIndex + 1}/{cards.length}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full max-w-sm bg-gray-200 rounded-full h-1.5 mb-8">
                    <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${learnProgress}%` }}
                    />
                </div>

                {/* Card */}
                <div className="w-full max-w-sm">
                    <div
                        className={`bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center mb-6 min-h-72 flex flex-col items-center justify-center
              ${cardState === 'hidden' ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
                        onClick={cardState === 'hidden' ? revealCard : undefined}
                    >
                        {/* Character */}
                        <div className="text-8xl font-bold text-gray-900 mb-2">{currentCard?.character}</div>

                        {cardState === 'hidden' ? (
                            <div className="mt-4">
                                <p className="text-gray-300 text-sm">Tap to reveal meaning</p>
                            </div>
                        ) : (
                            <div className="w-full mt-2">
                                <div className="h-px bg-gray-100 mb-4" />

                                {/* Pinyin */}
                                <p className="text-2xl text-blue-500 font-medium mb-3">{currentCard?.pinyin}</p>

                                {/* Word type */}
                                {currentCard?.word_type && (
                                    <span className="inline-block bg-gray-100 text-gray-500 text-xs px-2.5 py-0.5 rounded-full mb-3">
                                        {currentCard.word_type}
                                    </span>
                                )}

                                {/* Definition */}
                                <p className="text-base font-semibold text-gray-800 mb-1">{currentCard?.definition}</p>
                                {currentCard?.translation && (
                                    <p className="text-sm text-gray-400 italic">{currentCard.translation}</p>
                                )}

                                {/* Audio */}
                                {currentCard?.audio_url && (
                                    <button
                                        onClick={() => new Audio(currentCard.audio_url!).play()}
                                        className="mt-4 bg-blue-50 text-blue-500 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 mx-auto"
                                    >
                                        🔊 Listen
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Example sentences */}
                    {cardState === 'revealed' && currentCard?.examples && currentCard.examples.length > 0 && (
                        <div className="space-y-3 mb-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Examples</p>
                            {currentCard.examples.map((example, idx) => (
                                <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-4">
                                    <p className="text-gray-800 font-medium">{example.chinese}</p>
                                    <p className="text-blue-400 text-sm mt-0.5">{example.pinyin}</p>
                                    <p className="text-gray-400 text-sm">{example.french}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Navigation buttons */}
                    <div className="flex gap-3">
                        {currentIndex > 0 && (
                            <button
                                onClick={() => { setCurrentIndex(currentIndex - 1); setCardState('hidden') }}
                                className="flex-1 bg-white border border-gray-200 text-gray-600 py-4 rounded-2xl font-semibold active:scale-95 transition-transform"
                            >
                                ← Back
                            </button>
                        )}
                        <button
                            onClick={cardState === 'hidden' ? revealCard : nextLearnCard}
                            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-2xl font-bold shadow-lg shadow-purple-200 active:scale-95 transition-transform"
                        >
                            {cardState === 'hidden'
                                ? 'Reveal →'
                                : currentIndex === cards.length - 1
                                    ? 'Start Quiz 🧠'
                                    : 'Next →'
                            }
                        </button>
                    </div>

                    {/* Dot indicators */}
                    <div className="flex gap-1.5 justify-center mt-6">
                        {cards.map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-full transition-all duration-300
                  ${i === currentIndex ? 'w-5 h-2 bg-purple-500'
                                        : i < currentIndex ? 'w-2 h-2 bg-purple-300'
                                            : 'w-2 h-2 bg-gray-200'}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    // ── QUIZ ──
    if (phase === 'quiz') {
        const quizProgress = (quizIndex / quizCards.length) * 100

        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 pt-10 pb-8">
                {/* Header */}
                <div className="w-full max-w-sm flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-400">🧠 Quiz time</span>
                    <span className="text-sm font-semibold text-gray-700">Lesson {lessonNumber}</span>
                    <span className="text-sm text-gray-400">{quizIndex + 1}/{quizCards.length}</span>
                </div>

                {/* Progress */}
                <div className="w-full max-w-sm bg-gray-200 rounded-full h-1.5 mb-8">
                    <div
                        className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${quizProgress}%` }}
                    />
                </div>

                {/* Quiz card */}
                <div className="w-full max-w-sm">
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center mb-6 min-h-64 flex flex-col items-center justify-center">
                        {/* Character */}
                        <div className="text-8xl font-bold text-gray-900 mb-4">{currentQuizCard?.character}</div>

                        {!quizRevealed ? (
                            <>
                                <p className="text-gray-300 text-sm mb-4">What does this mean?</p>
                                <button
                                    onClick={() => setQuizRevealed(true)}
                                    className="bg-gray-100 text-gray-500 px-6 py-2.5 rounded-2xl font-medium text-sm active:scale-95 transition-transform"
                                >
                                    Show answer
                                </button>
                            </>
                        ) : (
                            <div className="w-full">
                                <div className="h-px bg-gray-100 mb-4" />
                                <p className="text-xl text-blue-500 font-medium mb-2">{currentQuizCard?.pinyin}</p>
                                <p className="text-base font-semibold text-gray-800 mb-1">{currentQuizCard?.definition}</p>
                                {currentQuizCard?.translation && (
                                    <p className="text-sm text-gray-400 italic">{currentQuizCard.translation}</p>
                                )}
                                {currentQuizCard?.audio_url && (
                                    <button
                                        onClick={() => new Audio(currentQuizCard.audio_url!).play()}
                                        className="mt-3 text-blue-400 text-sm flex items-center gap-1 mx-auto"
                                    >
                                        🔊 Listen
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Grade buttons */}
                    {quizRevealed && !saving && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleQuizGrade(0)}
                                className="flex-1 bg-red-50 border border-red-100 text-red-500 py-4 rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex flex-col items-center gap-1"
                            >
                                <span className="text-xl">😕</span>
                                <span>Forgot</span>
                            </button>
                            <button
                                onClick={() => handleQuizGrade(1)}
                                className="flex-1 bg-yellow-50 border border-yellow-100 text-yellow-600 py-4 rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex flex-col items-center gap-1"
                            >
                                <span className="text-xl">🤔</span>
                                <span>Almost</span>
                            </button>
                            <button
                                onClick={() => handleQuizGrade(2)}
                                className="flex-1 bg-green-50 border border-green-100 text-green-600 py-4 rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex flex-col items-center gap-1"
                            >
                                <span className="text-xl">✅</span>
                                <span>Got it!</span>
                            </button>
                        </div>
                    )}

                    {saving && (
                        <div className="flex flex-col items-center gap-2 mt-4">
                            <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-gray-400 text-sm">Saving results...</p>
                        </div>
                    )}

                    {/* Quiz results so far */}
                    {quizResults.length > 0 && !saving && (
                        <div className="flex gap-1.5 justify-center mt-5 flex-wrap">
                            {quizResults.map((r, i) => (
                                <span key={i} className="text-lg">
                                    {r === 2 ? '✅' : r === 1 ? '🤔' : '❌'}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ── RESULTS ──
    if (phase === 'results') {
        const total = quizResults.length
        const gotIt = quizResults.filter(r => r === 2).length
        const almost = quizResults.filter(r => r === 1).length
        const forgot = quizResults.filter(r => r === 0).length
        const score = Math.round((gotIt / total) * 100)

        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
                <div className="w-full max-w-sm text-center">
                    {/* Trophy */}
                    <div className="text-7xl mb-4">
                        {score >= 80 ? '🏆' : score >= 60 ? '⭐' : '💪'}
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-1">Lesson {lessonNumber} done!</h2>
                    <p className="text-gray-400 mb-6">Score: {score}%</p>

                    {/* Score ring */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 mb-5">
                        <div className="flex items-center justify-center mb-4">
                            <div className="relative w-24 h-24">
                                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                                    <circle
                                        cx="18" cy="18" r="15.9" fill="none"
                                        stroke={score >= 80 ? '#10B981' : score >= 60 ? '#FBBF24' : '#EF4444'}
                                        strokeWidth="3"
                                        strokeDasharray={`${score} ${100 - score}`}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-2xl font-bold text-gray-900">{score}%</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-green-50 rounded-2xl p-3">
                                <p className="text-2xl font-bold text-green-600">{gotIt}</p>
                                <p className="text-xs text-green-500">Got it</p>
                            </div>
                            <div className="bg-yellow-50 rounded-2xl p-3">
                                <p className="text-2xl font-bold text-yellow-600">{almost}</p>
                                <p className="text-xs text-yellow-500">Almost</p>
                            </div>
                            <div className="bg-red-50 rounded-2xl p-3">
                                <p className="text-2xl font-bold text-red-500">{forgot}</p>
                                <p className="text-xs text-red-400">Forgot</p>
                            </div>
                        </div>
                    </div>

                    {/* What happens next */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6 text-left">
                        <p className="text-sm font-semibold text-blue-700 mb-1">🔄 Added to review deck</p>
                        <p className="text-sm text-blue-500">
                            All {total} characters are now in your SRS queue.
                            {forgot > 0 && ` ${forgot} weak card${forgot > 1 ? 's' : ''} will appear sooner.`}
                        </p>
                    </div>

                    {/* Character results */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 text-left">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Results per card</p>
                        <div className="space-y-2">
                            {quizCards.map((card, i) => (
                                <div key={card.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-bold text-gray-900">{card.character}</span>
                                        <span className="text-sm text-blue-400">{card.pinyin}</span>
                                    </div>
                                    <span className="text-lg">
                                        {quizResults[i] === 2 ? '✅' : quizResults[i] === 1 ? '🤔' : '❌'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <button
                        onClick={() => router.push('/')}
                        className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-transform"
                    >
                        Back to Home 🏠
                    </button>

                    {forgot > 0 && (
                        <button
                            onClick={() => router.push('/study')}
                            className="w-full mt-3 bg-white border border-gray-200 text-gray-600 py-3.5 rounded-2xl font-semibold active:scale-95 transition-transform"
                        >
                            Review weak cards now →
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return null
}
