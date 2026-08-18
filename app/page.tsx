'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AppStats } from '@/types'
import PieChart from '@/components/PieChart'
import { formatNextReview } from '@/lib/srs'

const STATS_CACHE_KEY = 'app_stats_v2'
const CACHE_TTL = 3 * 60 * 1000
const DEFAULT_DAILY_GOAL = 10

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<AppStats>({
    new_: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    dueCount: 0,
    totalCards: 0,
    streak: 0,
  })
  const [loading, setLoading] = useState(true)
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL)
  const [lessonsToday, setLessonsToday] = useState(0)
  const [totalLessons, setTotalLessons] = useState(0) // ✅ NOUVEAU
  const [editingGoal, setEditingGoal] = useState(false)
  const [tempGoal, setTempGoal] = useState(DEFAULT_DAILY_GOAL)
  const [nextDueIn, setNextDueIn] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('dailyGoal')
    if (saved) {
      setDailyGoal(parseInt(saved))
      setTempGoal(parseInt(saved))
    }
    loadStats()
  }, [])

  const loadStats = useCallback(async (force = false) => {
    // Check cache
    if (!force) {
      const cached = localStorage.getItem(STATS_CACHE_KEY)
      if (cached) {
        try {
          const { data, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < CACHE_TTL) {
            setStats(data.stats)
            setLessonsToday(data.lessonsToday)
            setTotalLessons(data.totalLessons) // ✅ Load from cache
            setNextDueIn(data.nextDueIn)
            setLoading(false)
            return
          }
        } catch { }
      }
    }

    try {
      const now = new Date().toISOString()
      const today = new Date().toISOString().split('T')[0]
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id

      const [newRes, learningRes, reviewingRes, masteredRes, dueRes, lessonsTodayRes, streakRes, lessonsAllRes, nextRes] =
        await Promise.all([
          supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('phase', 'new'),
          supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('phase', 'learning'),
          supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('phase', 'reviewing'),
          supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('phase', 'mastered'),
          supabase.from('flashcards').select('*', { count: 'exact', head: true })
            .or(`next_review.lte.${now},phase.eq.learning`)
            .neq('phase', 'new'),
          // ✅ Lessons AUJOURD'HUI
          supabase.from('lesson_progress').select('*', { count: 'exact', head: true })
            .eq('completed_date', today),
          // ✅ Streak depuis DB
          supabase.from('streak_data').select('streak').eq('user_id', userId).single(),
          // ✅ TOTAL lessons de tous les temps
          supabase.from('lesson_progress').select('*', { count: 'exact', head: true }),
          supabase.from('flashcards').select('next_review')
            .neq('phase', 'new')
            .gt('next_review', now)
            .order('next_review', { ascending: true })
            .limit(1),
        ])

      const newStats: AppStats = {
        new_: newRes.count ?? 0,
        learning: learningRes.count ?? 0,
        reviewing: reviewingRes.count ?? 0,
        mastered: masteredRes.count ?? 0,
        dueCount: dueRes.count ?? 0,
        totalCards: (newRes.count ?? 0) + (learningRes.count ?? 0) + (reviewingRes.count ?? 0) + (masteredRes.count ?? 0),
        streak: streakRes.data?.streak ?? 0, // ✅ Depuis la DB
      }

      const todayLessons = lessonsTodayRes.count ?? 0
      const allLessons = lessonsAllRes.count ?? 0 // ✅ TOTAL
      const nextDue = nextRes.data?.[0]?.next_review
        ? formatNextReview(nextRes.data[0].next_review)
        : null

      setStats(newStats)
      setLessonsToday(todayLessons)
      setTotalLessons(allLessons) // ✅ Set total
      setNextDueIn(nextDue)

      // Cache avec totalLessons
      localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
        data: { stats: newStats, lessonsToday: todayLessons, totalLessons: allLessons, nextDueIn: nextDue },
        timestamp: Date.now(),
      }))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  function saveGoal() {
    setDailyGoal(tempGoal)
    localStorage.setItem('dailyGoal', tempGoal.toString())
    setEditingGoal(false)
  }

  const goalProgress = Math.min((lessonsToday / dailyGoal) * 100, 100)
  const goalDone = lessonsToday >= dailyGoal

  const resetStats = async () => {
    if (confirm('🔥 Reset Streak to 1 and Lessons to 0? This action cannot be undone.')) {
      try {
        const today = new Date().toISOString().split('T')[0]
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData.user?.id

        // Reset streak en DB
        await supabase
          .from('streak_data')
          .upsert(
            { user_id: userId, streak: 1, last_activity_date: today },
            { onConflict: 'user_id' }
          )

        // Reset localStorage
        localStorage.setItem('streak_data', JSON.stringify({
          streak: 1,
          lastDate: today
        }))

        // Delete today's lessons
        const { error } = await supabase
          .from('lesson_progress')
          .delete()
          .eq('completed_date', today)

        if (error) {
          console.error('Delete error:', error)
          alert('❌ Error: ' + error.message)
          return
        }

        // Clear cache
        localStorage.removeItem(STATS_CACHE_KEY)

        // Reload
        await loadStats(true)
        alert('✅ Reset done!')
      } catch (err) {
        console.error('Reset error:', err)
        alert('❌ Error: ' + String(err))
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-5xl animate-pulse">🀄</div>
      </div>
    )
  }

  return (
    <div className="pb-28 px-5 pt-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Words</h1>
          {stats.streak > 0 && (
            <p className="text-sm text-orange-400 font-medium mt-0.5">
              🔥 {stats.streak} day streak
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadStats(true)}
            className="text-gray-300 text-xl active:scale-90 transition-transform"
          >
            🔄
          </button>
          <button
            onClick={resetStats}
            className="text-red-400 text-xl active:scale-90 transition-transform hover:text-red-500"
            title="Reset Streak & Lessons"
          >
            ⚙️
          </button>
          <span className="text-4xl">🀄</span>
        </div>
      </div>

      {/* Daily Goal Card */}
      <div className={`rounded-3xl p-5 mb-4 shadow-sm border
        ${goalDone
          ? 'bg-gradient-to-br from-emerald-500 to-teal-500 border-transparent text-white'
          : 'bg-white border-gray-100'}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${goalDone ? 'text-emerald-100' : 'text-gray-400'}`}>
              Daily Goal
            </p>
            {editingGoal ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={tempGoal}
                  onChange={e => setTempGoal(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 font-bold"
                  min={1}
                  max={30}
                />
                <button onClick={saveGoal} className="text-teal-500 text-sm font-semibold">Save</button>
                <button onClick={() => setEditingGoal(false)} className="text-gray-400 text-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5">
                <p className={`text-2xl font-bold ${goalDone ? 'text-white' : 'text-gray-900'}`}>
                  {lessonsToday}/{dailyGoal} Lessons
                </p>
                <button
                  onClick={() => setEditingGoal(true)}
                  className={`text-xs px-2 py-0.5 rounded-lg ${goalDone ? 'bg-emerald-400 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
          <div className="text-3xl">
            {goalDone ? '🏆' : '🎯'}
          </div>
        </div>

        {/* Progress bar */}
        <div className={`rounded-full h-2 ${goalDone ? 'bg-emerald-400' : 'bg-gray-100'}`}>
          <div
            className={`h-2 rounded-full transition-all duration-700 ${goalDone ? 'bg-white' : 'bg-gradient-to-r from-teal-500 to-emerald-500'}`}
            style={{ width: `${goalProgress}%` }}
          />
        </div>

        {goalDone && (
          <p className="text-emerald-100 text-xs mt-2">🎉 Goal completed! Keep going?</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Due Now */}
        <button
          onClick={() => router.push('/study')}
          className={`rounded-3xl p-4 text-left shadow-sm border transition-all active:scale-95
            ${stats.dueCount > 0
              ? 'bg-gradient-to-br from-orange-400 to-red-400 border-transparent text-white'
              : 'bg-white border-gray-100'}`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${stats.dueCount > 0 ? 'text-orange-100' : 'text-gray-400'}`}>
                Due Now
              </p>
              <p className={`text-3xl font-bold mt-1 ${stats.dueCount > 0 ? 'text-white' : 'text-gray-900'}`}>
                {stats.dueCount}
              </p>
            </div>
            <span className="text-2xl">📚</span>
          </div>
          {stats.dueCount > 0 ? (
            <p className="text-orange-100 text-xs mt-1">Tap to review →</p>
          ) : nextDueIn ? (
            <p className="text-gray-400 text-xs mt-1">Next in {nextDueIn}</p>
          ) : (
            <p className="text-gray-400 text-xs mt-1">All caught up!</p>
          )}
        </button>

        {/* Total */}
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Remaining</p>
              <p className="text-3xl font-bold mt-1 text-gray-900">{stats.new_}</p>
            </div>
            <span className="text-2xl">🗂️</span>
          </div>
          <p className="text-gray-400 text-xs mt-1">{stats.totalCards} total cards</p>
        </div>
      </div>

      {/* Pie Chart + Phase Stats */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Progress Overview
        </h2>

        <div className="flex items-center gap-5">
          <div className="w-28 h-28 flex-shrink-0">
            <PieChart
              new_={stats.new_}
              learning={stats.learning}
              reviewing={stats.reviewing}
              mastered={stats.mastered}
            />
          </div>

          <div className="flex-1 space-y-2.5">
            {[
              { label: 'Mastered', value: stats.mastered, color: 'bg-emerald-500', emoji: '💪' },
              { label: 'Reviewing', value: stats.reviewing, color: 'bg-yellow-400', emoji: '⚡' },
              { label: 'Learning', value: stats.learning, color: 'bg-blue-500', emoji: '🆕' },
              { label: 'New', value: stats.new_, color: 'bg-gray-200', emoji: '📦' },
            ].map(({ label, value, color, emoji }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-sm text-gray-600">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900">{value}</span>
                  {stats.totalCards > 0 && (
                    <span className="text-xs text-gray-300">
                      {Math.round((value / stats.totalCards) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {stats.totalCards > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Mastery</span>
              <span>{Math.round((stats.mastered / stats.totalCards) * 100)}%</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2 rounded-full transition-all duration-700"
                style={{ width: `${(stats.mastered / stats.totalCards) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 mb-4">
        <button
          onClick={() => router.push('/study')}
          disabled={stats.dueCount === 0}
          className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all flex items-center justify-between px-6
            ${stats.dueCount > 0
              ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-teal-200'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📚</span>
            <div className="text-left">
              <p className="font-bold leading-tight">Review Cards</p>
              <p className="text-xs opacity-75 font-normal">
                {stats.dueCount > 0 ? `${stats.dueCount} cards waiting` : 'Nothing due right now'}
              </p>
            </div>
          </div>
          {stats.dueCount > 0 && <span className="text-xl opacity-75">→</span>}
        </button>

        <button
          onClick={() => router.push('/vocabulary')}
          className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 active:scale-95 transition-all flex items-center justify-between px-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📚</span>
            <div className="text-left">
              <p className="font-bold leading-tight">My Vocabulary</p>
              <p className="text-xs opacity-75 font-normal">
                Add and review your custom words
              </p>
            </div>
          </div>
          <span className="text-xl opacity-75">→</span>
        </button>

        <button
          onClick={() => router.push('/lesson')}
          className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg shadow-purple-200 active:scale-95 transition-all flex items-center justify-between px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div className="text-left">
              <p className="font-bold leading-tight">New Lesson</p>
              <p className="text-xs opacity-75 font-normal">
                Learn {Math.min(10, stats.new_)} new characters
              </p>
            </div>
          </div>
          <span className="text-xl opacity-75">→</span>
        </button>

        <button
          onClick={() => router.push('/exercises')}
          className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-between px-6 bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💪</span>
            <div className="text-left">
              <p className="font-bold leading-tight">Practice Exercises</p>
              <p className="text-xs opacity-75 font-normal">
                Fill in the blanks with learned words
              </p>
            </div>
          </div>
          <span className="text-xl opacity-75">→</span>
        </button>

        <button
          onClick={() => router.push('/idioms')}
          className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg shadow-orange-200 active:scale-95 transition-all flex items-center justify-between px-6 bg-gradient-to-r from-orange-400 to-amber-500 text-white"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <div className="text-left">
              <p className="font-bold leading-tight">Daily Idioms</p>
              <p className="text-xs opacity-75 font-normal">
                Learn one new idiom today
              </p>
            </div>
          </div>
          <span className="text-xl opacity-75">→</span>
        </button>

        <button
          onClick={() => router.push('/poems')}
          className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg shadow-purple-200 active:scale-95 transition-all flex items-center justify-between px-6 bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎭</span>
            <div className="text-left">
              <p className="font-bold leading-tight">Weekly Poems</p>
              <p className="text-xs opacity-75 font-normal">
                Discover classical Chinese poetry
              </p>
            </div>
          </div>
          <span className="text-xl opacity-75">→</span>
        </button>
      </div>

      {/* Quick stats row - ✅ FIXED */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Streak', value: `${stats.streak}`, sub: '🔥 days' },
          { label: 'Today', value: String(lessonsToday), sub: 'lessons' },
          { label: 'Total', value: String(totalLessons), sub: 'learned' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm">
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Browse cards link */}
      <button
        onClick={() => router.push('/cards')}
        className="w-full bg-white border border-gray-100 rounded-2xl py-3.5 text-gray-500 text-sm font-medium shadow-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
      >
        <span>🗂️</span>
        Browse all cards
        <span className="text-gray-300">({stats.totalCards})</span>
      </button>
    </div>
  )
}
