'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Exercise {
    id: string
    sentence_with_blank: string
    sentence_pinyin: string
    sentence_french: string
    choices: string[]
    correct_answer: string
    answer_pinyin: string
    answer_translation: string
    explanation: string
    difficulty: number
}

export default function ExercisesPage() {
    const router = useRouter()
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [userAnswer, setUserAnswer] = useState('')
    const [showResult, setShowResult] = useState(false)
    const [isCorrect, setIsCorrect] = useState(false)
    const [loading, setLoading] = useState(false)
    const [generatingCount, setGeneratingCount] = useState(5)

    // ✅ Aide
    const [showPinyin, setShowPinyin] = useState(false)
    const [showTranslation, setShowTranslation] = useState(false)

    // ✅ Stats
    const [stats, setStats] = useState({ correct: 0, total: 0 })

    // ✅ Streak
    const [streak, setStreak] = useState(0)
    const [bestStreak, setBestStreak] = useState(0)

    // ✅ Modal résultats finaux
    const [showFinalModal, setShowFinalModal] = useState(false)
    const [finalStats, setFinalStats] = useState({ correct: 0, total: 0, percentage: 0, streak: 0 })

    const currentExercise = exercises[currentIndex]

    // ✅ 1. Charger les exercices au démarrage
    useEffect(() => {
        fetchExercises()
    }, [])

    // ✅ Auto-passage si correct
    useEffect(() => {
        if (isCorrect && showResult && currentIndex < exercises.length - 1) {
            const timer = setTimeout(() => {
                handleNext()
            }, 1500)
            return () => clearTimeout(timer)
        }

        if (isCorrect && showResult && currentIndex === exercises.length - 1) {
            const timer = setTimeout(() => {
                const percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
                setFinalStats({
                    correct: stats.correct,
                    total: stats.total,
                    percentage,
                    streak: bestStreak,
                })
                setShowFinalModal(true)
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [isCorrect, showResult, currentIndex, exercises.length, stats, bestStreak])

    // ✅ Shuffle array utility
    const shuffleArray = (array: string[]) => {
        return [...array].sort(() => Math.random() - 0.5)
    }

    // ✅ 2. Récupérer les exercices existants
    const fetchExercises = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('exercises')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10)

            if (error) throw error

            const validExercises = (data || []).filter(
                (ex: any) =>
                    ex.choices &&
                    Array.isArray(ex.choices) &&
                    ex.choices.length === 4 &&
                    ex.correct_answer
            )

            const exercisesWithShuffled = validExercises.map((ex: any) => ({
                ...ex,
                choices: shuffleArray(ex.choices),
            }))

            setExercises(exercisesWithShuffled)
            setCurrentIndex(0)
            setStats({ correct: 0, total: exercisesWithShuffled.length })
            setStreak(0)
        } catch (error) {
            console.error('❌ Error fetching exercises:', error)
            alert('Erreur lors du chargement des exercices')
        } finally {
            setLoading(false)
        }
    }

    // ✅ 3. Générer de nouveaux exercices
    const generateNewExercises = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/generate-exercises', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: generatingCount }),
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.details || error.error || 'Erreur inconnue')
            }

            const data = await response.json()
            console.log('✅ Exercises generated:', data)

            await fetchExercises()
        } catch (error) {
            console.error('❌ Error generating exercises:', error)
            alert(`Erreur: ${error instanceof Error ? error.message : 'Impossible de générer les exercices'}`)
        } finally {
            setLoading(false)
        }
    }

    // ✅ 4. Sauvegarder la réponse dans exercise_results
    const handleSubmitAnswer = async (answer: string) => {
        const correct = answer === currentExercise.correct_answer

        setUserAnswer(answer)
        setIsCorrect(correct)
        setShowResult(true)

        if (correct) {
            const newStreak = streak + 1
            setStreak(newStreak)
            if (newStreak > bestStreak) setBestStreak(newStreak)
            setStats({ ...stats, correct: stats.correct + 1 })
        } else {
            setStreak(0)
        }

        // ✅ SAUVEGARDER DANS exercise_results
        try {
            const hintsUsed = []
            if (showPinyin) hintsUsed.push('pinyin')
            if (showTranslation) hintsUsed.push('translation')

            const { error } = await supabase.from('exercise_results').insert({
                exercise_id: currentExercise.id,
                user_answer: answer,
                is_correct: correct,
                attempt_number: 1,
                hints_used: hintsUsed.length > 0 ? hintsUsed : null,
                completed_at: new Date().toISOString(),
            })

            if (error) throw error
            console.log('✅ Résultat sauvegardé dans exercise_results:', { answer, correct })
        } catch (error) {
            console.error('❌ Error saving result:', error)
        }
    }

    // ✅ 5. Passer à l'exercice suivant
    const handleNext = () => {
        if (currentIndex < exercises.length - 1) {
            setCurrentIndex(currentIndex + 1)
            setUserAnswer('')
            setShowResult(false)
            setIsCorrect(false)
            setShowPinyin(false)
            setShowTranslation(false)
        } else {
            console.log('🏁 Fin des exercices !')
            const percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
            setFinalStats({
                correct: stats.correct,
                total: stats.total,
                percentage,
                streak: bestStreak,
            })
            setShowFinalModal(true)
        }
    }

    // ✅ 6. SUPPRIMER TOUS LES EXERCICES GÉNÉRÉS (NEW APPROACH)
    const deleteAndRegenerateExercises = async () => {
        try {
            setShowFinalModal(false)
            setLoading(true)

            // ✅ Récupérer les IDs des exercices AVANT de supprimer
            // On suppose que les exercices affichés sont les plus récents
            const exerciseIds = exercises.map(ex => ex.id)

            console.log('🗑️ IDs à supprimer:', exerciseIds)
            console.log('🗑️ Nombre d\'exercices à supprimer:', exerciseIds.length)

            if (!exerciseIds || exerciseIds.length === 0) {
                console.warn('⚠️ Aucun ID à supprimer')
                throw new Error('Aucun exercice à supprimer')
            }

            // ✅ Supprimer les exercices
            const { error: deleteError, count } = await supabase
                .from('exercises')
                .delete()
                .in('id', exerciseIds)

            if (deleteError) {
                console.error('❌ Erreur suppression:', deleteError)
                throw deleteError
            }

            console.log(`✅ ${count || 0} exercices supprimés avec succès`)

            // Délai visuel
            await new Promise(resolve => setTimeout(resolve, 800))

            // ✅ RESET COMPLET
            setExercises([])
            setCurrentIndex(0)
            setUserAnswer('')
            setShowResult(false)
            setIsCorrect(false)
            setShowPinyin(false)
            setShowTranslation(false)
            setStats({ correct: 0, total: 0 })
            setStreak(0)
            setBestStreak(0)
            setGeneratingCount(5)
            setLoading(false)

        } catch (error) {
            console.error('❌ Error deleting exercises:', error)
            alert(`Erreur lors de la suppression: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
            setLoading(false)
        }
    }

    // ── LOADING ──
    if (loading && exercises.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-400 text-sm">Chargement des exercices...</p>
                </div>
            </div>
        )
    }

    // ── NO EXERCISES ──
    if (exercises.length === 0 && !loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-2xl mx-auto">
                    <button
                        onClick={() => router.push('/')}
                        className="mb-6 text-gray-600 hover:text-gray-800 font-semibold flex items-center gap-2"
                    >
                        ← Retour
                    </button>

                    <div className="bg-white rounded-3xl p-8 text-center shadow-lg">
                        <h1 className="text-3xl font-bold text-gray-900 mb-4">
                            🎯 Créer une séquence d'exercices
                        </h1>
                        <p className="text-gray-600 mb-8">
                            Sélectionnez le nombre d'exercices que vous souhaitez faire
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3">
                                    Nombre d'exercices
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {[5, 10, 15].map((num) => (
                                        <button
                                            key={num}
                                            onClick={() => setGeneratingCount(num)}
                                            className={`py-3 px-4 rounded-xl font-semibold text-sm transition ${generatingCount === num
                                                ? 'bg-purple-500 text-white'
                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                                                }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={generateNewExercises}
                                disabled={loading}
                                className={`w-full py-3 font-bold rounded-xl transition active:scale-95 flex items-center justify-center gap-2 ${loading
                                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Génération en cours...
                                    </>
                                ) : (
                                    <>✨ Générer les exercices</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ── MAIN EXERCISE PAGE ──
    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <button
                    onClick={() => router.push('/')}
                    className="mb-6 text-gray-600 hover:text-gray-800 font-semibold flex items-center gap-2"
                >
                    ← Retour
                </button>

                <div className="space-y-6">
                    {/* Exercise card */}
                    {exercises.length > 0 && currentExercise && (
                        <div className="space-y-6 mb-8">
                            {/* Progress bar */}
                            <div className="w-full">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-semibold text-gray-700">
                                        Exercice {currentIndex + 1}/{exercises.length}
                                    </span>
                                    <span className="text-xs px-3 py-1 bg-purple-100 text-purple-600 rounded-full font-semibold">
                                        {'⭐'.repeat(currentExercise.difficulty)}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                    <div
                                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all duration-500"
                                        style={{
                                            width: `${((currentIndex + 1) / exercises.length) * 100}%`,
                                        }}
                                    ></div>
                                </div>
                            </div>

                            {/* Exercise content */}
                            <div className="bg-white rounded-3xl p-6 shadow-lg">
                                {/* Phrase avec trou */}
                                <div className="mb-8">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4 leading-relaxed">
                                        {currentExercise.sentence_with_blank}
                                    </h3>
                                </div>

                                {/* Help buttons */}
                                <div className="flex gap-2 mb-6">
                                    <button
                                        onClick={() => setShowPinyin(!showPinyin)}
                                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${showPinyin
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                                            }`}
                                    >
                                        🔊 Pinyin
                                    </button>
                                    <button
                                        onClick={() => setShowTranslation(!showTranslation)}
                                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${showTranslation
                                            ? 'bg-green-500 text-white'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                                            }`}
                                    >
                                        🌐 Traduction
                                    </button>
                                </div>

                                {/* Help display */}
                                {showPinyin && (
                                    <div className="bg-blue-50 border-l-4 border-blue-400 rounded-2xl p-4 mb-6">
                                        <p className="text-gray-700 text-sm">
                                            <span className="font-semibold text-blue-600">Pinyin:</span>{' '}
                                            {currentExercise.sentence_pinyin}
                                        </p>
                                    </div>
                                )}

                                {showTranslation && (
                                    <div className="bg-green-50 border-l-4 border-green-400 rounded-2xl p-4 mb-6">
                                        <p className="text-gray-700 text-sm">
                                            <span className="font-semibold text-green-600">Traduction:</span>{' '}
                                            {currentExercise.sentence_french}
                                        </p>
                                    </div>
                                )}

                                {/* Choices */}
                                {!showResult ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        {currentExercise.choices?.map((choice) => (
                                            <button
                                                key={choice}
                                                onClick={() => handleSubmitAnswer(choice)}
                                                className="py-3 px-4 bg-white border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 text-gray-800 rounded-xl font-semibold text-lg transition active:scale-95"
                                            >
                                                {choice}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {/* Results display */}
                                        <div className="grid grid-cols-2 gap-3 mb-6">
                                            {currentExercise.choices?.map((choice) => (
                                                <button
                                                    key={choice}
                                                    disabled
                                                    className={`py-3 px-4 rounded-xl font-semibold text-lg transition ${choice === currentExercise.correct_answer
                                                        ? 'bg-green-500 text-white'
                                                        : choice === userAnswer && !isCorrect
                                                            ? 'bg-red-500 text-white'
                                                            : 'bg-gray-100 text-gray-400'
                                                        }`}
                                                >
                                                    {choice}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Feedback */}
                                        <div className={`rounded-2xl p-4 mb-6 border-l-4 ${isCorrect
                                            ? 'bg-green-50 border-green-400'
                                            : 'bg-red-50 border-red-400'
                                            }`}>
                                            <p className={`font-bold text-lg mb-3 ${isCorrect ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                {isCorrect ? '✅ Correct !' : '❌ Incorrect'}
                                            </p>
                                            {!isCorrect && (
                                                <div className="space-y-2 text-sm mb-3">
                                                    <p className="text-gray-700">
                                                        <span className="font-semibold">Votre réponse:</span>{' '}
                                                        <span className="text-red-600 font-bold">{userAnswer}</span>
                                                    </p>
                                                    <p className="text-gray-700">
                                                        <span className="font-semibold">Bonne réponse:</span>{' '}
                                                        <span className="text-green-600 font-bold">
                                                            {currentExercise.correct_answer}
                                                        </span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Explanation */}
                                        <div className="bg-indigo-50 border-l-4 border-indigo-400 rounded-2xl p-4 mb-6">
                                            <p className="text-gray-800 text-sm">
                                                <span className="font-semibold text-indigo-600">💡 Explication:</span>{' '}
                                                {currentExercise.explanation}
                                            </p>
                                        </div>

                                        {/* Next button */}
                                        <button
                                            onClick={handleNext}
                                            className={`w-full font-bold py-3 rounded-xl transition active:scale-95 ${currentIndex === exercises.length - 1
                                                ? 'bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white'
                                                : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                                                }`}
                                        >
                                            {currentIndex === exercises.length - 1
                                                ? '📊 Voir résultats'
                                                : 'Suivant →'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Stats footer */}
                    {exercises.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
                                <p className="text-2xl font-bold text-green-600">{stats.correct}</p>
                                <p className="text-xs text-green-500 font-medium mt-1">Correctes</p>
                            </div>
                            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                                <p className="text-xs text-blue-500 font-medium mt-1">Total</p>
                            </div>
                            <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
                                <p className="text-2xl font-bold text-purple-600">
                                    {stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%
                                </p>
                                <p className="text-xs text-purple-500 font-medium mt-1">Pourcentage</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ✅ MODAL RÉSULTATS FINAUX */}
                {showFinalModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in">
                            <h2 className="text-3xl font-bold text-gray-900 mb-6">
                                📊 Résultats Finaux
                            </h2>

                            {/* Streak */}
                            {finalStats.streak > 0 && (
                                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-4 border border-yellow-200 mb-6">
                                    <p className="text-sm text-gray-600">Meilleur Streak</p>
                                    <p className="text-5xl font-bold text-yellow-500">🔥 {finalStats.streak}</p>
                                </div>
                            )}

                            {/* Percentage */}
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200 mb-6">
                                <p className="text-sm text-gray-600 mb-2">Score</p>
                                <p className="text-5xl font-bold text-purple-600">{finalStats.percentage}%</p>
                                <p className="text-sm text-gray-600 mt-2">
                                    {finalStats.correct}/{finalStats.total} correct
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="space-y-3">
                                <button
                                    onClick={deleteAndRegenerateExercises}
                                    disabled={loading}
                                    className={`w-full font-bold py-3 rounded-xl transition active:scale-95 flex items-center justify-center gap-2 ${loading
                                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                                        }`}
                                >
                                    {loading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Suppression en cours...
                                        </>
                                    ) : (
                                        <>🔄 Nouvelle séquence</>
                                    )}
                                </button>
                                <button
                                    onClick={() => router.push('/')}
                                    className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl transition active:scale-95"
                                >
                                    ← Retour à l'accueil
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
