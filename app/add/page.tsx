'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

interface Example {
    chinese: string
    pinyin: string
    french: string
}

export default function AddCardPage() {
    const router = useRouter()
    const [character, setCharacter] = useState('')
    const [pinyin, setPinyin] = useState('')
    const [wordType, setWordType] = useState('')
    const [definition, setDefinition] = useState('')
    const [translation, setTranslation] = useState('')
    const [examples, setExamples] = useState<Example[]>([{ chinese: '', pinyin: '', french: '' }])
    const [sentenceChinese, setSentenceChinese] = useState('')
    const [sentencePinyin, setSentencePinyin] = useState('')
    const [sentenceEnglish, setSentenceEnglish] = useState('')
    const [recording, setRecording] = useState(false)
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<BlobPart[]>([])

    function addExample() {
        setExamples([...examples, { chinese: '', pinyin: '', french: '' }])
    }

    function removeExample(index: number) {
        setExamples(examples.filter((_, i) => i !== index))
    }

    function updateExample(index: number, field: keyof Example, value: string) {
        const updated = [...examples]
        updated[index][field] = value
        setExamples(updated)
    }

    async function startRecording() {
        try {
            chunksRef.current = []
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
            })

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''

            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream)

            mediaRecorderRef.current = recorder
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
            }
            recorder.onstop = () => {
                const actualType = recorder.mimeType || 'audio/mp4'
                const blob = new Blob(chunksRef.current, { type: actualType })
                setAudioBlob(blob)
                setAudioUrl(URL.createObjectURL(blob))
                stream.getTracks().forEach((t) => t.stop())
            }
            recorder.start(250)
            setRecording(true)
        } catch (err) {
            console.error('Recording error:', err)
            alert('Microphone access denied or not supported')
        }
    }

    function stopRecording() {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        setRecording(false)
    }

    async function handleSave() {
        if (!character || !pinyin || !definition) return
        setSaving(true)

        const filteredExamples = examples.filter(e => e.chinese.trim() !== '')

        const { data: newCard, error } = await supabase
            .from('flashcards')
            .insert({
                character,
                pinyin,
                word_type: wordType || null,
                definition,
                translation: translation || null,
                examples: filteredExamples.length > 0 ? filteredExamples : null,
                strength: 'not_studied',
                phase: 'new',  // ← TOUJOURS EN NEW
                lesson_date: null,
                lesson_unlocked: false,
                next_review: new Date().toISOString(),
                interval_days: 1,
                ease_factor: 2.5,
                repetitions: 0,
                correct_streak: 0,
                wrong_streak: 0,
                created_at: new Date().toISOString()
            })
            .select()
            .single()


        if (error || !newCard) {
            setSaving(false)
            return
        }

        router.push('/')

        // Upload audio en background...
        if (audioBlob) {
            // ... reste du code identique
        }
    }


    return (
        <div className="min-h-screen bg-gray-50 pb-28">
            <div className="max-w-lg mx-auto px-4 pt-8">

                {/* Header */}
                <div className="flex items-center gap-3 mb-7">
                    <button onClick={() => router.back()} className="text-2xl text-gray-500">←</button>
                    <h1 className="text-xl font-bold text-gray-900">Add New Word</h1>
                </div>

                <div className="space-y-4">

                    {/* Character + Pinyin */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-br from-teal-50 to-blue-50 p-6 text-center">
                            <input
                                value={character}
                                onChange={(e) => setCharacter(e.target.value)}
                                placeholder="你好"
                                className="w-full text-5xl font-bold text-gray-900 text-center bg-transparent outline-none placeholder-gray-300"
                            />
                            <input
                                value={pinyin}
                                onChange={(e) => setPinyin(e.target.value)}
                                placeholder="nǐ hǎo"
                                className="w-full mt-2 text-xl text-blue-500 text-center bg-transparent outline-none placeholder-blue-200 font-medium"
                            />
                        </div>

                        {/* Word Type */}
                        <div className="px-5 py-3 border-t border-gray-50">
                            <input
                                value={wordType}
                                onChange={(e) => setWordType(e.target.value)}
                                placeholder="Type de mot : Verbe modal, Nom, Adjectif..."
                                className="w-full text-sm text-gray-500 bg-transparent outline-none placeholder-gray-300 text-center"
                            />
                        </div>
                    </div>

                    {/* Definition + Translation */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                Définition <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                value={definition}
                                onChange={(e) => setDefinition(e.target.value)}
                                placeholder="Verbe modal : devoir, il faut, être censé"
                                rows={2}
                                className="w-full mt-2 text-gray-900 font-semibold text-base bg-transparent outline-none resize-none border-b border-gray-100 pb-3 placeholder-gray-300"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Traduction courte</label>
                            <input
                                value={translation}
                                onChange={(e) => setTranslation(e.target.value)}
                                placeholder="devoir / il faut"
                                className="w-full mt-2 text-gray-600 bg-transparent outline-none placeholder-gray-300 text-sm italic"
                            />
                        </div>
                    </div>

                    {/* Examples */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Exemples</label>
                            <button
                                onClick={addExample}
                                className="text-teal-500 text-sm font-semibold active:scale-95 transition-transform"
                            >
                                + Ajouter
                            </button>
                        </div>

                        <div className="space-y-4">
                            {examples.map((ex, i) => (
                                <div key={i} className="border-l-2 border-teal-200 pl-4 relative">
                                    {examples.length > 1 && (
                                        <button
                                            onClick={() => removeExample(i)}
                                            className="absolute -top-1 right-0 text-gray-300 text-xs active:scale-95"
                                        >
                                            ✕
                                        </button>
                                    )}
                                    <input
                                        value={ex.chinese}
                                        onChange={(e) => updateExample(i, 'chinese', e.target.value)}
                                        placeholder="你应该学习。"
                                        className="w-full text-gray-900 font-medium bg-transparent outline-none border-b border-gray-100 pb-1 mb-2 placeholder-gray-300"
                                    />
                                    <input
                                        value={ex.pinyin}
                                        onChange={(e) => updateExample(i, 'pinyin', e.target.value)}
                                        placeholder="Nǐ yīnggāi xuéxí."
                                        className="w-full text-blue-400 text-sm bg-transparent outline-none border-b border-gray-100 pb-1 mb-2 placeholder-blue-200"
                                    />
                                    <input
                                        value={ex.french}
                                        onChange={(e) => updateExample(i, 'french', e.target.value)}
                                        placeholder="Tu devrais étudier."
                                        className="w-full text-gray-500 text-sm italic bg-transparent outline-none placeholder-gray-300"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Daily sentence */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Phrase du quotidien <span className="text-gray-300 font-normal normal-case">(optionnel)</span>
                        </label>
                        <div className="mt-4 border-l-2 border-blue-200 pl-4 space-y-3">
                            <input
                                value={sentenceChinese}
                                onChange={(e) => setSentenceChinese(e.target.value)}
                                placeholder="早上的时候，风里还会有一点点水。"
                                className="w-full text-gray-900 font-medium bg-transparent outline-none border-b border-gray-100 pb-2 placeholder-gray-300"
                            />
                            <input
                                value={sentencePinyin}
                                onChange={(e) => setSentencePinyin(e.target.value)}
                                placeholder="Zǎo shang de shí hou..."
                                className="w-full text-blue-400 text-sm bg-transparent outline-none border-b border-gray-100 pb-2 placeholder-blue-200"
                            />
                            <input
                                value={sentenceEnglish}
                                onChange={(e) => setSentenceEnglish(e.target.value)}
                                placeholder="In the mornings, there was still a little moisture in the wind."
                                className="w-full text-gray-500 text-sm italic bg-transparent outline-none placeholder-gray-300"
                            />
                        </div>
                    </div>

                    {/* Audio */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Enregistrement audio <span className="text-gray-300 font-normal normal-case">(optionnel)</span>
                        </label>
                        <div className="flex items-center gap-3 mt-3">
                            {!recording ? (
                                <button
                                    onClick={startRecording}
                                    className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-500 px-4 py-2.5 rounded-2xl font-medium text-sm active:scale-95 transition-transform"
                                >
                                    🎙️ Enregistrer
                                </button>
                            ) : (
                                <button
                                    onClick={stopRecording}
                                    className="flex items-center gap-2 bg-red-500 text-white px-4 py-2.5 rounded-2xl font-medium text-sm animate-pulse"
                                >
                                    ⏹ Stop
                                </button>
                            )}
                            {audioUrl && (
                                <audio controls src={audioUrl} className="flex-1 h-9 rounded-xl" />
                            )}
                        </div>
                    </div>

                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={!character || !pinyin || !definition || saving}
                        className="w-full bg-gradient-to-r from-teal-400 to-teal-600 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-all shadow-sm"
                    >
                        {saving ? 'Saving...' : '💾 Save Word'}
                    </button>

                </div>
            </div>
            <BottomNav active="add" />
        </div>
    )
}


