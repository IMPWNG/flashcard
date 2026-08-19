'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Theme {
    id: string;
    theme_name: string;
    theme_description: string;
    generated_date: string;
}

interface VocabItem {
    id: string;
    chinese_word: string;
    english_translation: string;
    pinyin: string;
    hsk_level: number;
}

interface Phrase {
    id: string;
    phrase_type: string;
    speaker: string | null;
    chinese_text: string;
    english_translation: string;
    pinyin: string;
    hsk_level: number;
    phrase_order: number;
}

export default function DailyThemePage() {
    const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
    const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
    const [phrases, setPhrases] = useState<Phrase[]>([]);
    const [pastThemes, setPastThemes] = useState<Theme[]>([]);
    const [loading, setLoading] = useState(false);
    const [showEnglish, setShowEnglish] = useState(false);
    const [selectedPastTheme, setSelectedPastTheme] = useState<string | null>(null);

    // Charge la thématique du jour
    useEffect(() => {
        loadTodayTheme();
        loadPastThemes();
    }, []);

    const loadTodayTheme = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];

            const { data: themeData, error: themeError } = await supabase
                .from('daily_themes')
                .select('*')
                .eq('generated_date', today)
                .single();

            if (themeData) {
                setCurrentTheme(themeData);
                loadThemeContent(themeData.id);
            } else if (themeError?.code === 'PGRST116') {
                // Aucune thématique pour aujourd'hui, génère-en une
                generateNewTheme();
            }
        } catch (error) {
            console.error('Error loading theme:', error);
        }
    };

    const loadThemeContent = async (themeId: string) => {
        try {
            // Charge le vocabulaire
            const { data: vocabData } = await supabase
                .from('theme_vocabulary')
                .select('*')
                .eq('theme_id', themeId)
                .order('created_at', { ascending: true });

            if (vocabData) setVocabulary(vocabData);

            // Charge les phrases et dialogues
            const { data: phrasesData } = await supabase
                .from('theme_phrases')
                .select('*')
                .eq('theme_id', themeId)
                .order('phrase_order', { ascending: true });

            if (phrasesData) setPhrases(phrasesData);
        } catch (error) {
            console.error('Error loading theme content:', error);
        }
    };

    const loadPastThemes = async () => {
        try {
            const { data } = await supabase
                .from('daily_themes')
                .select('*')
                .order('generated_date', { ascending: false })
                .limit(30);

            if (data) setPastThemes(data);
        } catch (error) {
            console.error('Error loading past themes:', error);
        }
    };

    const generateNewTheme = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/generate-daily-theme', {
                method: 'POST',
            });

            const result = await response.json();

            if (result.success) {
                await loadTodayTheme();
            }
        } catch (error) {
            console.error('Error generating theme:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePastThemeClick = (themeId: string) => {
        const theme = pastThemes.find((t) => t.id === themeId);
        if (theme) {
            setSelectedPastTheme(themeId);
            setCurrentTheme(theme);
            loadThemeContent(themeId);
        }
    };

    const groupDialogues = () => {
        const dialogues = [];
        let currentDialogue: Phrase[] = [];

        for (const phrase of phrases) {
            if (phrase.phrase_type === 'dialogue') {
                currentDialogue.push(phrase);
            } else {
                if (currentDialogue.length > 0) {
                    dialogues.push(currentDialogue);
                    currentDialogue = [];
                }
            }
        }
        if (currentDialogue.length > 0) {
            dialogues.push(currentDialogue);
        }

        return dialogues;
    };

    const isolatedPhrases = phrases.filter((p) => p.phrase_type === 'isolated_phrase');
    const dialogues = groupDialogues();

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
            <div className="max-w-6xl mx-auto">
                {/* Navbar */}
                <div className="flex justify-between items-center mb-8">
                    <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-semibold">
                        ← Back
                    </Link>
                    <h1 className="text-4xl font-bold text-indigo-900">Daily Themes</h1>
                    <button
                        onClick={() => setShowEnglish(!showEnglish)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                    >
                        {showEnglish ? '隐藏英文' : '显示英文'}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar - Historique */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow-lg p-6">
                            <h2 className="text-2xl font-bold text-indigo-900 mb-4">📚 History</h2>
                            <button
                                onClick={generateNewTheme}
                                disabled={loading}
                                className="w-full mb-4 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:bg-gray-400"
                            >
                                {loading ? 'Generating...' : '✨ Generate Today'}
                            </button>

                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {pastThemes.map((theme) => (
                                    <button
                                        key={theme.id}
                                        onClick={() => handlePastThemeClick(theme.id)}
                                        className={`w-full text-left p-3 rounded-lg transition ${selectedPastTheme === theme.id
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 hover:bg-gray-200'
                                            }`}
                                    >
                                        <div className="font-semibold text-sm truncate">{theme.theme_name}</div>
                                        <div className={`text-xs ${selectedPastTheme === theme.id ? 'text-indigo-100' : 'text-gray-600'}`}>
                                            {new Date(theme.generated_date).toLocaleDateString()}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-8">
                        {currentTheme && (
                            <>
                                {/* Theme Header */}
                                <div className="bg-white rounded-lg shadow-lg p-8">
                                    <h1 className="text-4xl font-bold text-indigo-900 mb-2">
                                        {currentTheme.theme_name}
                                    </h1>
                                    <p className="text-gray-600 text-lg mb-4">
                                        {currentTheme.theme_description}
                                    </p>
                                    <div className="text-sm text-gray-500">
                                        📅 {new Date(currentTheme.generated_date).toLocaleDateString()}
                                    </div>
                                </div>

                                {/* Vocabulary Section */}
                                <div className="bg-white rounded-lg shadow-lg p-8">
                                    <h2 className="text-3xl font-bold text-indigo-900 mb-6">📖 Vocabulary</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {vocabulary.map((vocab) => (
                                            <div
                                                key={vocab.id}
                                                className="p-4 bg-indigo-50 rounded-lg border-l-4 border-indigo-500 hover:shadow-md transition"
                                            >
                                                <div className="text-2xl font-bold text-indigo-900 mb-2">
                                                    {vocab.chinese_word}
                                                </div>
                                                <div className="text-indigo-700 italic mb-2">{vocab.pinyin}</div>
                                                {showEnglish && (
                                                    <div className="text-gray-700">{vocab.english_translation}</div>
                                                )}
                                                <div className="mt-2 text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded inline-block">
                                                    HSK {vocab.hsk_level}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Dialogues Section */}
                                {dialogues.length > 0 && (
                                    <div className="bg-white rounded-lg shadow-lg p-8">
                                        <h2 className="text-3xl font-bold text-indigo-900 mb-6">💬 Dialogues</h2>
                                        <div className="space-y-6">
                                            {dialogues.map((dialogue, dialogueIndex) => (
                                                <div
                                                    key={dialogueIndex}
                                                    className="p-6 bg-blue-50 rounded-lg border-l-4 border-blue-500"
                                                >
                                                    {dialogue.map((phrase) => (
                                                        <div
                                                            key={phrase.id}
                                                            className={`mb-4 ${phrase.speaker === 'Person A'
                                                                    ? 'mr-8'
                                                                    : 'ml-8'
                                                                }`}
                                                        >
                                                            <div className="font-bold text-blue-900 mb-2">
                                                                {phrase.speaker}
                                                            </div>
                                                            <div className="text-lg font-semibold text-gray-900 mb-1">
                                                                {phrase.chinese_text}
                                                            </div>
                                                            <div className="text-blue-700 italic mb-2">
                                                                {phrase.pinyin}
                                                            </div>
                                                            {showEnglish && (
                                                                <div className="text-gray-700">{phrase.english_translation}</div>
                                                            )}
                                                            <div className="mt-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded inline-block">
                                                                HSK {phrase.hsk_level}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Isolated Phrases Section */}
                                {isolatedPhrases.length > 0 && (
                                    <div className="bg-white rounded-lg shadow-lg p-8">
                                        <h2 className="text-3xl font-bold text-indigo-900 mb-6">
                                            ✨ Useful Phrases
                                        </h2>
                                        <div className="space-y-4">
                                            {isolatedPhrases.map((phrase) => (
                                                <div
                                                    key={phrase.id}
                                                    className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500"
                                                >
                                                    <div className="text-lg font-semibold text-gray-900 mb-1">
                                                        {phrase.chinese_text}
                                                    </div>
                                                    <div className="text-green-700 italic mb-2">
                                                        {phrase.pinyin}
                                                    </div>
                                                    {showEnglish && (
                                                        <div className="text-gray-700">{phrase.english_translation}</div>
                                                    )}
                                                    <div className="mt-2 text-xs bg-green-200 text-green-800 px-2 py-1 rounded inline-block">
                                                        HSK {phrase.hsk_level}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}