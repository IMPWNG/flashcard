'use client'

import { useEffect, useState, useRef, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Flashcard } from '@/types'
import { formatNextReview } from '@/lib/srs'

type FilterPhase = 'all' | 'new' | 'learning' | 'reviewing' | 'mastered'

const PAGE_SIZE = 100
const DB_NAME = 'flashcards_db'
const STORE_NAME = 'cards'
const CACHE_VERSION = 'v2'

// ✅ IndexedDB Helper - SEULEMENT côté client
class FlashcardsDB {
    private dbPromise: Promise<IDBDatabase>

    constructor() {
        this.dbPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined') {
                reject(new Error('IndexedDB not available on server'))
                return
            }

            const request = indexedDB.open(DB_NAME, 1)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
            request.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' })
                }
            }
        })
    }

    async saveCards(cards: Flashcard[]) {
        const db = await this.dbPromise
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.clear()
        cards.forEach(card => store.add(card))
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    }

    async updateCard(card: Flashcard) {
        const db = await this.dbPromise
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.put(card)
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    }

    async deleteCard(id: string) {
        const db = await this.dbPromise
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.delete(id)
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    }

    async loadCards(): Promise<Flashcard[]> {
        const db = await this.dbPromise
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        return new Promise((resolve, reject) => {
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    async clearCards() {
        const db = await this.dbPromise
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).clear()
        return new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    }
}

let cardsDB: FlashcardsDB | null = null

// ✅ Lazy initialize IndexedDB
function getCardsDB() {
    if (typeof window !== 'undefined' && !cardsDB) {
        cardsDB = new FlashcardsDB()
    }
    return cardsDB
}

// ✅ LocalStorage cache manager
const cacheManager = {
    getCacheTimestamp: () => {
        try {
            if (typeof window === 'undefined') return 0
            const cache = localStorage.getItem(`${CACHE_VERSION}_cards_timestamp`)
            return cache ? parseInt(cache) : 0
        } catch {
            return 0
        }
    },

    setCacheTimestamp: () => {
        try {
            if (typeof window === 'undefined') return
            localStorage.setItem(`${CACHE_VERSION}_cards_timestamp`, Date.now().toString())
        } catch {
            console.warn('Cache timestamp save failed')
        }
    },

    isCacheExpired: (maxAge = 24 * 60 * 60 * 1000) => {
        const timestamp = cacheManager.getCacheTimestamp()
        return Date.now() - timestamp > maxAge
    },

    invalidateCache: () => {
        try {
            if (typeof window === 'undefined') return
            localStorage.removeItem(`${CACHE_VERSION}_cards_timestamp`)
        } catch {
            console.warn('Cache invalidation failed')
        }
    }
}

// ✅ Component qui utilise useSearchParams
function CardsPageContent() {
    const router = useRouter()
    const [allCards, setAllCards] = useState<Flashcard[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingProgress, setLoadingProgress] = useState(0)
    const [search, setSearch] = useState('')
    const [filterPhase, setFilterPhase] = useState<FilterPhase>('all')
    const [filterWordType, setFilterWordType] = useState<string>('all')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [displayedCount, setDisplayedCount] = useState(PAGE_SIZE)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const observerTarget = useRef<HTMLDivElement>(null)
    const isMountedRef = useRef(true)

    // ✅ Fetch avec cache intelligent
    useEffect(() => {
        isMountedRef.current = true
        fetchAllCards()

        return () => {
            isMountedRef.current = false
        }
    }, [])

    // ✅ Détection de card modifiée (côté client uniquement)
    useEffect(() => {
        if (typeof window === 'undefined') return

        const params = new URLSearchParams(window.location.search)
        const editedId = params.get('edited')

        if (editedId) {
            refreshEditedCard(editedId)
        }
    }, [])

    // ✅ Refresh SEULEMENT la carte modifiée
    async function refreshEditedCard(cardId: string) {
        try {
            setUpdatingId(cardId)
            const { data, error } = await supabase
                .from('flashcards')
                .select('*')
                .eq('id', cardId)
                .single()

            if (error) throw error
            if (!data) return

            const updated = allCards.map(c =>
                c.id === cardId ? data : c
            )
            setAllCards(updated)

            const db = getCardsDB()
            if (db) {
                await db.updateCard(data).catch(console.error)
            }

            console.log(`✅ Card ${cardId} refreshed`)

            // Nettoyer le paramètre
            if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/cards')
            }
        } catch (err) {
            console.error('Refresh card error:', err)
        } finally {
            setUpdatingId(null)
        }
    }

    async function fetchAllCards() {
        try {
            setLoading(true)
            setLoadingProgress(0)

            // ✅ 1. Essayer charger depuis IndexedDB
            try {
                const db = getCardsDB()
                if (db) {
                    const cached = await db.loadCards()
                    if (cached.length > 0 && !cacheManager.isCacheExpired()) {
                        console.log(`✅ Loaded ${cached.length} cards from IndexedDB`)
                        if (isMountedRef.current) {
                            setAllCards(cached)
                            setLoading(false)
                        }
                        return
                    }
                }
            } catch (e) {
                console.warn('IndexedDB load failed:', e)
            }

            // ✅ 2. Charger progressivement depuis Supabase
            let allData: Flashcard[] = []
            let offset = 0
            const batchSize = 500

            while (true) {
                const { data, error } = await supabase
                    .from('flashcards')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .range(offset, offset + 499)

                if (error) {
                    console.error('Supabase error:', error)
                    throw error
                }

                if (!data || data.length === 0) break

                allData = [...allData, ...data]
                offset += batchSize

                const progress = Math.min((allData.length / 5000) * 100, 95)
                if (isMountedRef.current) {
                    setLoadingProgress(Math.round(progress))
                    setAllCards([...allData])
                }

                console.log(`📥 Fetched ${allData.length} cards...`)
            }

            console.log(`✅ Total cards: ${allData.length}`)

            if (isMountedRef.current) {
                setAllCards(allData)
                setLoadingProgress(100)
            }

            // ✅ 3. Sauvegarder dans IndexedDB
            const db = getCardsDB()
            if (db) {
                await Promise.all([
                    db.saveCards(allData),
                    new Promise(resolve => {
                        cacheManager.setCacheTimestamp()
                        resolve(null)
                    })
                ]).catch(e => {
                    console.warn('Cache save failed:', e)
                })
            }

        } catch (err) {
            console.error('Fetch error:', err)
            try {
                const db = getCardsDB()
                if (db) {
                    const cached = await db.loadCards()
                    if (cached.length > 0 && isMountedRef.current) {
                        setAllCards(cached)
                    }
                }
            } catch { }
        } finally {
            if (isMountedRef.current) {
                setLoading(false)
            }
        }
    }

    // ✅ Word types uniques
    const wordTypes = useMemo(() => {
        const types = new Set(allCards
            .map(c => c.word_type)
            .filter((type): type is string => Boolean(type))
        )
        return Array.from(types).sort()
    }, [allCards])

    // ✅ Filtrage MEMOÏZÉ
    const filtered = useMemo(() => {
        let result = [...allCards]

        if (filterPhase !== 'all') {
            result = result.filter(c => c.phase === filterPhase)
        }

        if (filterWordType !== 'all') {
            result = result.filter(c => c.word_type === filterWordType)
        }

        if (search.trim()) {
            const q = search.toLowerCase().trim()
            result = result.filter(c =>
                c.character.includes(q) ||
                c.pinyin.toLowerCase().includes(q) ||
                c.definition.toLowerCase().includes(q) ||
                c.translation?.toLowerCase().includes(q)
            )
        }

        result.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())

        return result
    }, [allCards, search, filterPhase, filterWordType])

    // ✅ Pagination
    const displayed = useMemo(() => {
        return filtered.slice(0, displayedCount)
    }, [filtered, displayedCount])

    // ✅ Infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && displayedCount < filtered.length) {
                    requestAnimationFrame(() => {
                        setDisplayedCount(prev => Math.min(prev + PAGE_SIZE, filtered.length))
                    })
                }
            },
            { threshold: 0.1 }
        )

        if (observerTarget.current) {
            observer.observe(observerTarget.current)
        }

        return () => observer.disconnect()
    }, [displayedCount, filtered.length])

    useEffect(() => {
        setDisplayedCount(PAGE_SIZE)
    }, [search, filterPhase, filterWordType])

    const counts = useMemo(() => ({
        all: allCards.length,
        new: allCards.filter(c => c.phase === 'new').length,
        learning: allCards.filter(c => c.phase === 'learning').length,
        reviewing: allCards.filter(c => c.phase === 'reviewing').length,
        mastered: allCards.filter(c => c.phase === 'mastered').length,
    }), [allCards])

    // ✅ Delete avec cache sync
    async function deleteCard(id: string) {
        if (!confirm('Delete this card?')) return
        setDeletingId(id)

        const { error } = await supabase.from('flashcards').delete().eq('id', id)
        if (!error) {
            const updated = allCards.filter(c => c.id !== id)
            setAllCards(updated)
            const db = getCardsDB()
            if (db) {
                await db.deleteCard(id).catch(console.error)
            }
        }
        setExpandedId(null)
        setDeletingId(null)
    }

    // ✅ Reset avec cache sync
    async function resetCard(card: Flashcard) {
        if (!confirm(`Reset "${card.character}" to new?`)) return
        setUpdatingId(card.id)

        const resetData: Partial<Flashcard> = {
            phase: 'new',
            ease_factor: 2.5,
            interval_days: 0,
            repetitions: 0,
            correct_streak: 0,
            wrong_streak: 0,
            next_review: new Date().toISOString(),
            lesson_date: null,
            lesson_unlocked: false,
        }

        const { error } = await supabase
            .from('flashcards')
            .update(resetData)
            .eq('id', card.id)

        if (!error) {
            const updated = allCards.map(c =>
                c.id === card.id
                    ? { ...c, ...resetData } as Flashcard
                    : c
            )
            setAllCards(updated)
            const db = getCardsDB()
            if (db) {
                const updatedCard = updated.find(c => c.id === card.id)
                if (updatedCard) {
                    await db.updateCard(updatedCard).catch(console.error)
                }
            }
        }
        setUpdatingId(null)
    }

    const phaseColor = (phase: string) => {
        const colors: Record<string, string> = {
            mastered: 'text-emerald-600 bg-emerald-50',
            reviewing: 'text-yellow-600 bg-yellow-50',
            learning: 'text-blue-600 bg-blue-50',
            new: 'text-gray-600 bg-gray-100'
        }
        return colors[phase] || 'text-gray-500 bg-gray-100'
    }

    const phaseEmoji = (phase: string) => {
        const emojis: Record<string, string> = {
            mastered: '💪',
            reviewing: '⚡',
            learning: '📚',
            new: '🆕'
        }
        return emojis[phase] || '📦'
    }

    if (loading) {
        return (
            <div className="pb-28 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-pulse text-5xl mb-3">🀄</div>
                    <p className="text-gray-400 text-sm mb-4">Loading cards...</p>
                    {allCards.length > 0 && (
                        <>
                            <p className="text-gray-600 font-semibold text-lg mb-2">{allCards.length}</p>
                            <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden mx-auto">
                                <div
                                    className="h-full bg-teal-500 transition-all duration-300"
                                    style={{ width: `${loadingProgress}%` }}
                                />
                            </div>
                            <p className="text-gray-400 text-xs mt-2">{loadingProgress}%</p>
                        </>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="pb-28 min-h-screen bg-gray-50">

            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-5 pt-8 pb-4 sticky top-0 z-30">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="text-2xl text-gray-600 active:scale-90 transition-transform"
                        >
                            ←
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900">My Cards</h1>
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-full font-semibold">
                            {allCards.length}
                        </span>
                    </div>
                    <button
                        onClick={() => router.push('/add')}
                        className="bg-teal-500 text-white w-9 h-9 rounded-xl flex items-center justify-center text-xl font-bold shadow-sm active:scale-90 transition-transform"
                    >
                        +
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">🔍</span>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search character, pinyin, definition..."
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-300 transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 text-lg active:scale-90"
                        >
                            ×
                        </button>
                    )}
                </div>

                {/* Phase filters */}
                <div className="mb-3">
                    <p className="text-xs text-gray-400 font-semibold mb-2">Phase</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {(['all', 'new', 'learning', 'reviewing', 'mastered'] as FilterPhase[]).map(p => {
                            const emoji = p === 'all' ? '📋' : phaseEmoji(p)
                            const label = p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)

                            return (
                                <button
                                    key={p}
                                    onClick={() => setFilterPhase(p)}
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterPhase === p
                                        ? 'bg-teal-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {emoji} {label}
                                    <span className="ml-1 opacity-75">({counts[p]})</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Word type filters */}
                {wordTypes.length > 0 && (
                    <div>
                        <p className="text-xs text-gray-400 font-semibold mb-2">Word Type</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            <button
                                onClick={() => setFilterWordType('all')}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterWordType === 'all'
                                    ? 'bg-teal-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                All ({allCards.length})
                            </button>
                            {wordTypes.map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilterWordType(type)}
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterWordType === type
                                        ? 'bg-teal-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {type} ({allCards.filter(c => c.word_type === type).length})
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Stats bar */}
            <div className="px-5 py-3 bg-white border-b border-gray-100">
                <span className="text-xs text-gray-500 font-medium">
                    Showing {displayed.length} / {filtered.length} cards
                </span>
            </div>

            {/* Cards list */}
            <div className="px-5 space-y-2 py-4">
                {filtered.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="text-5xl mb-3">
                            {search ? '🔍' : '📭'}
                        </div>
                        <p className="text-gray-400">
                            {search ? `No results for "${search}"` : 'No cards found'}
                        </p>
                    </div>
                ) : (
                    <>
                        {displayed.map(card => (
                            <CardItem
                                key={card.id}
                                card={card}
                                isExpanded={expandedId === card.id}
                                onExpand={() => setExpandedId(card.id)}
                                onCollapse={() => setExpandedId(null)}
                                onDelete={() => deleteCard(card.id)}
                                onReset={() => resetCard(card)}
                                isDeleting={deletingId === card.id}
                                isUpdating={updatingId === card.id}
                                phaseColor={phaseColor}
                                phaseEmoji={phaseEmoji}
                                router={router}
                            />
                        ))}

                        {displayedCount < filtered.length && (
                            <div ref={observerTarget} className="py-8 flex justify-center">
                                <p className="text-xs text-gray-300">Scroll to load more...</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

// ✅ Suspense boundary pour useSearchParams
function CardsSuspense() {
    return <CardsPageContent />
}

export default function CardsPage() {
    return (
        <Suspense fallback={
            <div className="pb-28 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-pulse text-5xl mb-3">🀄</div>
                    <p className="text-gray-400">Loading...</p>
                </div>
            </div>
        }>
            <CardsSuspense />
        </Suspense>
    )
}

// CardItem composant (reste inchangé)
function CardItem({
    card,
    isExpanded,
    onExpand,
    onCollapse,
    onDelete,
    onReset,
    isDeleting,
    isUpdating,
    phaseColor,
    phaseEmoji,
    router,
}: {
    card: Flashcard
    isExpanded: boolean
    onExpand: () => void
    onCollapse: () => void
    onDelete: () => void
    onReset: () => void
    isDeleting: boolean
    isUpdating: boolean
    phaseColor: (phase: string) => string
    phaseEmoji: (phase: string) => string
    router: any
}) {
    return (
        <div>
            {!isExpanded ? (
                <button
                    onClick={onExpand}
                    disabled={isUpdating}
                    className="w-full bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 hover:border-teal-200 transition-all text-left active:scale-[0.98] disabled:opacity-50"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-3xl font-bold text-gray-900 w-10 text-center flex-shrink-0">
                            {card.character}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-blue-400 font-medium">{card.pinyin}</span>
                                {card.word_type && (
                                    <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">
                                        {card.word_type}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-600 truncate">{card.definition}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${phaseColor(card.phase)}`}>
                                {phaseEmoji(card.phase)} {card.phase}
                            </span>
                            {card.phase !== 'new' && (
                                <span className="text-xs text-gray-300">
                                    {formatNextReview(card.next_review)}
                                </span>
                            )}
                        </div>
                    </div>
                </button>
            ) : (
                <div className={`bg-white rounded-2xl shadow-sm border transition-all ${isUpdating ? 'border-yellow-200 opacity-75' : 'border-teal-200'} overflow-hidden`}>
                    <button
                        onClick={onCollapse}
                        disabled={isUpdating}
                        className="w-full px-4 pt-4 pb-2 text-left disabled:opacity-50"
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-5xl font-bold text-gray-900">{card.character}</span>
                            <div className="flex-1">
                                <p className="text-lg text-blue-500 font-medium">{card.pinyin}</p>
                                {card.word_type && (
                                    <p className="text-xs text-gray-400 mt-1">{card.word_type}</p>
                                )}
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${phaseColor(card.phase)}`}>
                                {phaseEmoji(card.phase)} {card.phase}
                            </span>
                        </div>
                        <p className="text-gray-800 font-semibold mt-2">{card.definition}</p>
                        {card.translation && (
                            <p className="text-gray-400 text-sm italic">{card.translation}</p>
                        )}
                    </button>

                    {card.audio_url && (
                        <div className="px-4 py-2">
                            <button
                                onClick={() => {
                                    const audio = new Audio(card.audio_url!)
                                    audio.play().catch(e => console.error('Audio error:', e))
                                }}
                                disabled={isUpdating}
                                className="bg-blue-50 text-blue-500 px-3 py-1.5 rounded-xl text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
                            >
                                🔊 Listen
                            </button>
                        </div>
                    )}

                    {card.examples && card.examples.length > 0 && (
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs text-gray-400 font-semibold">EXAMPLES</p>
                                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">
                                    {card.examples.length}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {card.examples.map((example, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100">
                                        <p className="text-gray-800 text-sm font-medium">{example.chinese}</p>
                                        <p className="text-blue-400 text-xs mt-1">{example.pinyin}</p>
                                        <p className="text-gray-400 text-xs mt-1">{example.french}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="px-4 py-3">
                        <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-xl text-xs">
                            <div className="text-center">
                                <p className="text-gray-400 mb-1">Ease</p>
                                <p className="font-bold text-gray-900">{(card.ease_factor || 2.5).toFixed(1)}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-gray-400 mb-1">Reps</p>
                                <p className="font-bold text-gray-900">{card.repetitions || 0}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-gray-400 mb-1">Streak</p>
                                <p className="font-bold text-green-600">+{card.correct_streak || 0}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-gray-400 mb-1">Next</p>
                                <p className="font-bold text-gray-900">
                                    {card.phase === 'new' ? '-' : formatNextReview(card.next_review)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 pb-4 flex gap-2">
                        <button
                            onClick={() => router.push(`/cards/edit/${card.id}?from=/cards`)}
                            disabled={isUpdating}
                            className="bg-blue-50 text-blue-500 px-3 py-1.5 rounded-lg text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
                        >
                            ✏️ Edit
                        </button>
                        <button
                            onClick={onReset}
                            disabled={isUpdating || isDeleting}
                            className="flex-1 bg-yellow-50 text-yellow-600 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform disabled:opacity-50"
                        >
                            {isUpdating ? '⏳' : '🔄'} Reset
                        </button>
                        <button
                            onClick={onDelete}
                            disabled={isDeleting || isUpdating}
                            className="flex-1 bg-red-50 text-red-500 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform disabled:opacity-50"
                        >
                            {isDeleting ? '...' : '🗑️'} Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
