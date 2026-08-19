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
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
                generateNewTheme();
            }
        } catch (error) {
            console.error('Error loading theme:', error);
        }
    };

    const loadThemeContent = async (themeId: string) => {
        try {
            const { data: vocabData } = await supabase
                .from('theme_vocabulary')
                .select('*')
                .eq('theme_id', themeId)
                .order('created_at', { ascending: true });

            if (vocabData) setVocabulary(vocabData);

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
            setSidebarOpen(false);
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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-4 min-h-screen">
                {/* Sidebar - Historique */}
                <div
                    className={`fixed lg:relative top-0 left-0 w-64 lg:w-full h-screen lg:h-auto col-span-1 bg-white shadow-lg z-50 transform transition-transform duration-300 lg:translate-x-0 overflow-y-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                >
                    <div className="p-6">
                        <h2 className="text-2xl font-bold text-indigo-900 mb-4">📚 History</h2>
                        <button
                            onClick={generateNewTheme}
                            disabled={loading}
                            className="w-full mb-4 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:bg-gray-400"
                        >
                            {loading ? 'Generating...' : '✨ Generate Today'}
                        </button>

                        <div className="space-y-2">
                            {pastThemes.map((theme) => (
                                <button
                                    key={theme.id}
                                    onClick={() => handlePastThemeClick(theme.id)}
                                    className={`w-full text-left p-3 rounded-lg transition text-sm ${selectedPastTheme === theme.id
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 hover:bg-gray-200'
                                        }`}
                                >
                                    <div className="font-semibold truncate">
                                        {theme.theme_name}
                                    </div>
                                    <div
                                        className={`text-xs ${selectedPastTheme === theme.id
                                                ? 'text-indigo-100'
                                                : 'text-gray-600'
                                            }`}
                                    >
                                        {new Date(theme.generated_date).toLocaleDateString()}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="col-span-1 lg:col-span-3 w-full">
                    {/* Navbar */}
                    <div className="sticky top-0 bg-white shadow-md z-30">
                        <div className="flex justify-between items-center px-4 lg:px-8 py-4">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setSidebarOpen(!sidebarOpen)}
                                    className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-xl"
                                >
                                    ☰
                                </button>
                                <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm lg:text-base">
                                    ← Back
                                </Link>
                            </div>
                            <h1 className="text-xl lg:text-3xl font-bold text-indigo-900 text-center flex-1 mx-4">
                                Daily Themes
                            </h1>
                            <button
                                onClick={() => setShowEnglish(!showEnglish)}
                                className="px-3 lg:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs lg:text-sm whitespace-nowrap"
                            >
                                {showEnglish ? '隐藏英文' : '显示英文'}
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="p-4 lg:p-8 pb-20">
                        <div className="max-w-4xl mx-auto space-y-6 lg:space-y-8">
                            {currentTheme && (
                                <>
                                    {/* Theme Header */}
                                    <div className="bg-white rounded-lg shadow-lg p-6 lg:p-8">
                                        <h1 className="text-2xl lg:text-4xl font-bold text-indigo-900 mb-3">
                                            {currentTheme.theme_name}
                                        </h1>
                                        <p className="text-gray-600 text-sm lg:text-lg mb-4">
                                            {currentTheme.theme_description}
                                        </p>
                                        <div className="text-xs lg:text-sm text-gray-500">
                                            📅{' '}
                                            {new Date(currentTheme.generated_date).toLocaleDateString()}
                                        </div>
                                    </div>

                                    {/* Vocabulary Section */}
                                    {vocabulary.length > 0 && (
                                        <div className="bg-white rounded-lg shadow-lg p-6 lg:p-8">
                                            <h2 className="text-xl lg:text-3xl font-bold text-indigo-900 mb-6">
                                                📖 Vocabulary
                                            </h2>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {vocabulary.map((vocab) => (
                                                    <div
                                                        key={vocab.id}
                                                        className="p-4 bg-indigo-50 rounded-lg border-l-4 border-indigo-500 hover:shadow-md transition"
                                                    >
                                                        <div className="text-xl lg:text-2xl font-bold text-indigo-900 mb-2">
                                                            {vocab.chinese_word}
                                                        </div>
                                                        <div className="text-indigo-700 italic mb-2 text-sm">
                                                            {vocab.pinyin}
                                                        </div>
                                                        {showEnglish && (
                                                            <div className="text-gray-700 text-sm">
                                                                {vocab.english_translation}
                                                            </div>
                                                        )}
                                                        <div className="mt-2 text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded inline-block">
                                                            HSK {vocab.hsk_level}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Dialogues Section */}
                                    {dialogues.length > 0 && (
                                        <div className="bg-white rounded-lg shadow-lg p-6 lg:p-8">
                                            <h2 className="text-xl lg:text-3xl font-bold text-indigo-900 mb-6">
                                                💬 Dialogues
                                            </h2>
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
                                                                        ? 'ml-0'
                                                                        : 'ml-0 lg:ml-8'
                                                                    }`}
                                                            >
                                                                <div className="font-bold text-blue-900 mb-1 text-sm">
                                                                    {phrase.speaker}
                                                                </div>
                                                                <div className="text-base lg:text-lg font-semibold text-gray-900 mb-1">
                                                                    {phrase.chinese_text}
                                                                </div>
                                                                <div className="text-blue-700 italic mb-2 text-sm">
                                                                    {phrase.pinyin}
                                                                </div>
                                                                {showEnglish && (
                                                                    <div className="text-gray-700 text-sm">
                                                                        {phrase.english_translation}
                                                                    </div>
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
                                        <div className="bg-white rounded-lg shadow-lg p-6 lg:p-8">
                                            <h2 className="text-xl lg:text-3xl font-bold text-indigo-900 mb-6">
                                                ✨ Useful Phrases
                                            </h2>
                                            <div className="space-y-4">
                                                {isolatedPhrases.map((phrase) => (
                                                    <div
                                                        key={phrase.id}
                                                        className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500"
                                                    >
                                                        <div className="text-base lg:text-lg font-semibold text-gray-900 mb-1">
                                                            {phrase.chinese_text}
                                                        </div>
                                                        <div className="text-green-700 italic mb-2 text-sm">
                                                            {phrase.pinyin}
                                                        </div>
                                                        {showEnglish && (
                                                            <div className="text-gray-700 text-sm">
                                                                {phrase.english_translation}
                                                            </div>
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

                            {!currentTheme && !loading && (
                                <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                                    <p className="text-gray-600">No theme loaded</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}