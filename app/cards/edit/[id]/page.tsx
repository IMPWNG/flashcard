'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { clearFlashcardsCache } from '@/lib/cache'

interface Example {
    chinese: string
    pinyin: string
    french: string
}

interface Flashcard {
    id: string
    character: string
    pinyin: string
    word_type?: string
    definition: string
    translation?: string
    examples?: Example[]
    sentence_chinese?: string
    sentence_pinyin?: string
    sentence_english?: string
    audio_url?: string
}

export default function EditCardPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const [character, setCharacter] = useState('')
    const [pinyin, setPinyin] = useState('')
    const [wordType, setWordType] = useState('')
    const [definition, setDefinition] = useState('')
    const [translation, setTranslation] = useState('')
    const [examples, setExamples] = useState<Example[]>([])
    const [sentenceChinese, setSentenceChinese] = useState('')
    const [sentencePinyin, setSentencePinyin] = useState('')
    const [sentenceEnglish, setSentenceEnglish] = useState('')
    const [existingAudioUrl, setExistingAudioUrl] = useState<string | null>(null)
    const [recording, setRecording] = useState(false)
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<BlobPart[]>([])

    useEffect(() => {
        fetchCard()
    }, [params.id])

    async function fetchCard() {
        try {
            setLoading(true)
            const { data, error: fetchError } = await supabase
                .from('flashcards')
                .select('*')
                .eq('id', params.id)
                .single()

            if (fetchError) throw fetchError
            if (!data) throw new Error('Card not found')

            const card: Flashcard = data
            setCharacter(card.character)
            setPinyin(card.pinyin)
            setWordType(card.word_type || '')
            setDefinition(card.definition)
            setTranslation(card.translation || '')
            setExamples(card.examples || [])
            setSentenceChinese(card.sentence_chinese || '')
            setSentencePinyin(card.sentence_pinyin || '')
            setSentenceEnglish(card.sentence_english || '')
            if (card.audio_url) {
                setExistingAudioUrl(card.audio_url)
            }
        } catch (err) {
            console.error('Fetch error:', err)
            setError('Failed to load card')
        } finally {
            setLoading(false)
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream)
            mediaRecorderRef.current = mediaRecorder
            chunksRef.current = []

            mediaRecorder.ondataavailable = (e) => {
                chunksRef.current.push(e.data)
            }

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
                setAudioBlob(blob)
                setAudioPreviewUrl(URL.createObjectURL(blob))
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorder.start()
            setRecording(true)
        } catch (err) {
            console.error('Recording error:', err)
            alert('Unable to access microphone')
        }
    }

    function stopRecording() {
        if (mediaRecorderRef.current && recording) {
            mediaRecorderRef.current.stop()
            setRecording(false)
        }
    }

    function addExample() {
        setExamples([...examples, { chinese: '', pinyin: '', french: '' }])
    }

    function removeExample(index: number) {
        setExamples(examples.filter((_, i) => i !== index))
    }

    function updateExample(index: number, field: keyof Example, value: string) {
        const updated = [...examples]
        updated[index] = { ...updated[index], [field]: value }
        setExamples(updated)
    }

    async function handleSave() {
        if (!character || !pinyin || !definition) {
            alert('Please fill in required fields')
            return
        }
        setSaving(true)

        try {
            const cleanExamples = examples.filter(ex => ex.chinese.trim() !== '')
            const updateData: any = {
                character,
                pinyin,
                word_type: wordType || null,
                definition,
                translation: translation || null,
                examples: cleanExamples.length > 0 ? cleanExamples : null,
                sentence_chinese: sentenceChinese || null,
                sentence_pinyin: sentencePinyin || null,
                sentence_english: sentenceEnglish || null,
                updated_at: new Date().toISOString(),
            }

            // ✅ 1. Upload audio EN PARALLÈLE avec la mise à jour texte
            let audioUploadPromise = Promise.resolve<string | null>(null)

            if (audioBlob) {
                audioUploadPromise = (async () => {
                    if (existingAudioUrl) {
                        const oldFile = existingAudioUrl.split('/').pop()
                        if (oldFile) {
                            await supabase.storage.from('audio').remove([oldFile]).catch(() => { })
                        }
                    }

                    const ext = audioBlob.type.includes('mp4') ? 'm4a'
                        : audioBlob.type.includes('ogg') ? 'ogg'
                            : audioBlob.type.includes('wav') ? 'wav' : 'webm'

                    const fileName = `${params.id}-${Date.now()}.${ext}`
                    const { error: uploadError } = await supabase.storage
                        .from('audio')
                        .upload(fileName, audioBlob)

                    if (uploadError) throw uploadError

                    const { data: { publicUrl } } = supabase.storage
                        .from('audio')
                        .getPublicUrl(fileName)

                    return publicUrl
                })()
            }

            // ✅ 2. Attendre TOUT en parallèle
            const audioUrl = await audioUploadPromise

            // ✅ 3. Une seule mise à jour avec l'audio URL si nécessaire
            if (audioUrl) {
                updateData.audio_url = audioUrl
            }

            const { error: updateError } = await supabase
                .from('flashcards')
                .update(updateData)
                .eq('id', params.id)

            if (updateError) throw updateError

            // ✅ 4. Vider le cache IndexedDB EN ARRIÈRE-PLAN (pas besoin d'attendre)
            if (typeof window !== 'undefined' && 'indexedDB' in window) {
                indexedDB.deleteDatabase('flashcards_db')
            }

            // ✅ 5. Redirection immédiate
            router.push(`/cards?edited=${params.id}`)
        } catch (err) {
            console.error('Save error:', err)
            alert('Error saving changes')
            setSaving(false)
        }
    }



    if (loading) {
        return (
            <div className="pb-28 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-pulse text-5xl mb-3">🀄</div>
                    <p className="text-gray-400">Loading card...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="pb-28 min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-500 mb-4">{error}</p>
                    <button
                        onClick={() => router.back()}
                        className="bg-teal-500 text-white px-4 py-2 rounded-xl"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        )
    }

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
                    <h1 className="text-2xl font-bold text-gray-900">Edit Card</h1>
                    <div className="w-9" />
                </div>
            </div>

            {/* Form */}
            <div className="px-5 space-y-4 py-4">
                {/* Character & Pinyin */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Character & Pinyin</p>

                    <div className="flex gap-3">
                        <input
                            value={character}
                            onChange={(e) => setCharacter(e.target.value)}
                            placeholder="学"
                            className="w-1/3 text-4xl font-bold text-gray-900 text-center bg-gray-50 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                        />
                        <input
                            value={pinyin}
                            onChange={(e) => setPinyin(e.target.value)}
                            placeholder="xuéxí"
                            className="flex-1 text-lg text-blue-400 font-medium bg-gray-50 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                        />
                    </div>
                </div>

                {/* Word Type & Definition */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Word Type & Definition</p>

                    <input
                        value={wordType}
                        onChange={(e) => setWordType(e.target.value)}
                        placeholder="noun, verb, adjective... (optionnel)"
                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                    />

                    <textarea
                        value={definition}
                        onChange={(e) => setDefinition(e.target.value)}
                        placeholder="Définition en français"
                        className="w-full h-20 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent resize-none"
                    />

                    <textarea
                        value={translation}
                        onChange={(e) => setTranslation(e.target.value)}
                        placeholder="Traduction anglaise (optionnel)"
                        className="w-full h-16 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent resize-none italic"
                    />
                </div>

                {/* Audio */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audio</p>

                    <div className="space-y-3">
                        {existingAudioUrl && !audioBlob && (
                            <div className="bg-blue-50 p-3 rounded-xl flex items-center justify-between">
                                <span className="text-sm text-blue-600 font-medium">📁 Audio existant</span>
                                <button
                                    onClick={() => {
                                        const audio = new Audio(existingAudioUrl)
                                        audio.play().catch(console.error)
                                    }}
                                    className="text-blue-500 text-sm font-medium"
                                >
                                    🔊 Écouter
                                </button>
                            </div>
                        )}

                        {audioPreviewUrl && (
                            <div className="bg-green-50 p-3 rounded-xl flex items-center justify-between">
                                <span className="text-sm text-green-600 font-medium">✓ Nouvel audio enregistré</span>
                                <button
                                    onClick={() => {
                                        const audio = new Audio(audioPreviewUrl)
                                        audio.play().catch(console.error)
                                    }}
                                    className="text-green-500 text-sm font-medium"
                                >
                                    🔊 Écouter
                                </button>
                            </div>
                        )}

                        <button
                            onClick={recording ? stopRecording : startRecording}
                            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${recording
                                ? 'bg-red-500 text-white animate-pulse'
                                : 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                                }`}
                        >
                            {recording ? '⏹️ Stop Recording' : '🎤 Record Audio'}
                        </button>
                    </div>
                </div>

                {/* Examples */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Exemples <span className="text-gray-300 font-normal normal-case">(optionnel)</span></p>
                        <button
                            onClick={addExample}
                            className="text-teal-500 text-sm font-semibold hover:text-teal-600"
                        >
                            + Ajouter
                        </button>
                    </div>

                    {examples.length > 0 && (
                        <div className="space-y-4">
                            {examples.map((ex, i) => (
                                <div key={i} className="space-y-2 pb-4 border-b border-gray-100 last:border-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400">Exemple {i + 1}</span>
                                        <button
                                            onClick={() => removeExample(i)}
                                            className="text-red-400 text-xs font-medium hover:text-red-600"
                                        >
                                            ✕ Retirer
                                        </button>
                                    </div>
                                    <input
                                        value={ex.chinese}
                                        onChange={(e) => updateExample(i, 'chinese', e.target.value)}
                                        placeholder="你应该学习。"
                                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                                    />
                                    <input
                                        value={ex.pinyin}
                                        onChange={(e) => updateExample(i, 'pinyin', e.target.value)}
                                        placeholder="Nǐ yīnggāi xuéxí."
                                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-blue-400 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                                    />
                                    <input
                                        value={ex.french}
                                        onChange={(e) => updateExample(i, 'french', e.target.value)}
                                        placeholder="Tu devrais étudier."
                                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-400 italic focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Daily Sentence */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Phrase du quotidien <span className="text-gray-300 font-normal normal-case">(optionnel)</span></p>

                    <input
                        value={sentenceChinese}
                        onChange={(e) => setSentenceChinese(e.target.value)}
                        placeholder="你应该认真学习中文。"
                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                    />

                    <input
                        value={sentencePinyin}
                        onChange={(e) => setSentencePinyin(e.target.value)}
                        placeholder="Nǐ yīnggāi rènzhēn xuéxí zhōngwén."
                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-blue-400 focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                    />

                    <input
                        value={sentenceEnglish}
                        onChange={(e) => setSentenceEnglish(e.target.value)}
                        placeholder="You should study Chinese seriously."
                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-400 italic focus:outline-none focus:ring-2 focus:ring-teal-300 border border-transparent"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        onClick={() => router.push('/')}
                        className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold active:scale-95 transition-transform"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold active:scale-95 transition-transform disabled:opacity-50"
                    >
                        {saving ? '💾 Saving...' : '💾 Save'}
                    </button>
                </div>
            </div>
        </div>
    )
}
