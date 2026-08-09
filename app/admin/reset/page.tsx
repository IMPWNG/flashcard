'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function resetEverything() {
        if (!window.confirm('⚠️ Êtes-vous SÛR? Cela réinitialisera TOUT et supprimera tous vos progrès!')) {
            return
        }

        setLoading(true)
        setMessage('Réinitialisation en cours...')

        try {
            // 1️⃣ Réinitialiser tous les flashcards
            const { error: cardsError } = await supabase
                .from('flashcards')
                .update({
                    // ✅ Phase-based reset
                    phase: 'learning',

                    // ✅ SRS parameters reset
                    ease_factor: 2.5,
                    interval_days: 0,
                    repetitions: 0,
                    next_review: new Date().toISOString(),

                    // ✅ Streak reset
                    correct_streak: 0,
                    wrong_streak: 0,

                    // ✅ Lesson tracking reset
                    lesson_learned: false,
                    lesson_date: null,
                })
                .neq('id', '00000000-0000-0000-0000-000000000000')

            if (cardsError) throw cardsError

            // 2️⃣ Réinitialiser app_meta
            const { error: metaError } = await supabase
                .from('app_meta')
                .update({
                    last_review_date: null,
                    next_review_date: null,
                })
                .eq('key', 'review')

            if (metaError) throw metaError

            // 3️⃣ 🔥 NETTOYER TOUS LES CACHES LOCALSTORAGE
            const keysToRemove = [
                'lesson_cache',
                'study_cards_cache',
                'home_stats_cache',
                'dailyGoal',
                'home_daily_stats',
                'home_page_stats',
                'stats_cache',
                'flashcards_cache',
                'today_studied',
                'goal_progress',
                'phase_cache',
                'srs_stats_cache',
            ]

            keysToRemove.forEach(key => {
                localStorage.removeItem(key)
            })

            // 4️⃣ Nettoyer sessionStorage aussi
            sessionStorage.clear()

            // 5️⃣ Force refresh
            window.location.href = '/'

            setMessage('✅ Tout a été réinitialisé! Redirection...')
        } catch (err) {
            console.error(err)
            setMessage('❌ Erreur lors de la réinitialisation')
        } finally {
            setLoading(false)
        }
    }

    async function deleteAllCards() {
        if (!window.confirm('⚠️ ATTENTION: Cela supprimera TOUS les mots (irréversible)!')) {
            return
        }

        setLoading(true)
        setMessage('Suppression en cours...')

        try {
            // 1️⃣ Supprimer tous les flashcards
            const { error: deleteError } = await supabase
                .from('flashcards')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000')

            if (deleteError) throw deleteError

            // 2️⃣ Réinitialiser app_meta
            const { error: metaError } = await supabase
                .from('app_meta')
                .update({
                    last_review_date: null,
                    next_review_date: null,
                })
                .eq('key', 'review')

            if (metaError) throw metaError

            // 3️⃣ Nettoyer caches
            const keysToRemove = [
                'lesson_cache',
                'study_cards_cache',
                'home_stats_cache',
                'dailyGoal',
                'home_daily_stats',
                'home_page_stats',
                'stats_cache',
                'flashcards_cache',
                'today_studied',
                'goal_progress',
                'phase_cache',
                'srs_stats_cache',
            ]

            keysToRemove.forEach(key => {
                localStorage.removeItem(key)
            })

            sessionStorage.clear()

            // 4️⃣ Force refresh
            window.location.href = '/'

            setMessage('✅ Tous les mots supprimés! Redirection...')
        } catch (err) {
            console.error(err)
            setMessage('❌ Erreur lors de la suppression')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 gap-4">
            {/* Reset Progress Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm max-w-sm w-full">
                <div className="text-6xl mb-4 text-center">🔄</div>
                <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Reset Progress</h1>

                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 text-left text-sm text-yellow-700">
                    <p className="font-semibold mb-2">Cela réinitialisera:</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>Toutes les phases (learning → mastered)</li>
                        <li>Tous les paramètres SRS</li>
                        <li>Les streaks (correct/wrong)</li>
                        <li>Les dates de révision</li>
                        <li>Les mots marqués comme "appris"</li>
                        <li>Le cache local</li>
                    </ul>
                </div>

                <p className="text-gray-600 text-sm mb-6 text-center">
                    Tous les mots repasseront en phase "Learning". Vous recommencez depuis zéro.
                </p>

                {message && (
                    <p className={`text-sm font-semibold mb-4 text-center ${message.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
                        {message}
                    </p>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={() => router.back()}
                        disabled={loading}
                        className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl hover:bg-gray-200 disabled:opacity-50"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={resetEverything}
                        disabled={loading}
                        className="flex-1 bg-yellow-500 text-white font-semibold py-3 rounded-2xl hover:bg-yellow-600 disabled:opacity-50 active:scale-95 transition-transform"
                    >
                        {loading ? 'Réinitialisation...' : 'Réinitialiser'}
                    </button>
                </div>
            </div>

            {/* Delete All Cards Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm max-w-sm w-full">
                <div className="text-6xl mb-4 text-center">🗑️</div>
                <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Delete All Words</h1>

                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-left text-sm text-red-700">
                    <p className="font-semibold mb-2">⚠️ Action IRRÉVERSIBLE:</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>Suppression de TOUS les mots</li>
                        <li>Suppression de TOUT votre progrès</li>
                        <li>Impossibilité de récupérer les données</li>
                    </ul>
                </div>

                <p className="text-gray-600 text-sm mb-6 text-center">
                    Utilisez ceci seulement si vous voulez recommencer complètement.
                </p>

                <div className="flex gap-3">
                    <button
                        onClick={() => router.back()}
                        disabled={loading}
                        className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-2xl hover:bg-gray-200 disabled:opacity-50"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={deleteAllCards}
                        disabled={loading}
                        className="flex-1 bg-red-500 text-white font-semibold py-3 rounded-2xl hover:bg-red-600 disabled:opacity-50 active:scale-95 transition-transform"
                    >
                        {loading ? 'Suppression...' : 'Supprimer'}
                    </button>
                </div>
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 max-w-sm w-full">
                <p className="text-sm text-blue-700 text-center">
                    💡 <span className="font-semibold">Conseil:</span> Utilisez "Reset Progress" pour recommencer votre apprentissage. Utilisez "Delete All Words" seulement en cas de besoin exceptionnel.
                </p>
            </div>
        </div>
    )
}
