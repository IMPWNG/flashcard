'use client';

import { useState, useEffect } from 'react';
import { supabase } from "@/lib/supabase";
import Link from 'next/link';

interface VocabCard {
    id: string;
    word: string;
    definition: string;
    example_phrase: string;
    is_mastered: boolean;
    review_count: number;
    pinyin?: string;
}

export default function VocabularyReviewPage() {
    const [cards, setCards] = useState<VocabCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPinyin, setIsGeneratingPinyin] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadNonMasteredCards();
    }, []);

    const loadNonMasteredCards = async () => {
        try {
            const { data, error } = await supabase
                .from('my_vocab')
                .select('*')
                .eq('is_mastered', false)
                .order('review_count', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }

            console.log('Cards loaded:', data);
            setCards(data || []);
        } catch (error) {
            console.error('Error:', error);
            setMessage('❌ Erreur au chargement');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGeneratePinyin = async () => {
        setIsGeneratingPinyin(true);
        setMessage('⏳ Génération du pinyin...');

        try {
            const response = await fetch('/api/generate-pinyin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = await response.json();

            if (!response.ok) {
                setMessage(`❌ ${data.error || 'Erreur'}`);
                return;
            }

            setMessage(
                `✅ Pinyin généré pour ${data.updatedCount} mots!`
            );

            // Recharge les cartes
            await loadNonMasteredCards();

            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            console.error('Error:', error);
            setMessage(`❌ ${error.message || 'Erreur'}`);
        } finally {
            setIsGeneratingPinyin(false);
        }
    };

    const handleMastered = async () => {
        const card = cards[currentIndex];

        try {
            const { error } = await supabase
                .from('my_vocab')
                .update({
                    is_mastered: true,
                    review_count: card.review_count + 1,
                })
                .eq('id', card.id);

            if (error) throw error;

            setMessage('✅ Excellent! Mot marqué comme maîtrisé');
            moveToNext();
        } catch (error: any) {
            setMessage(`❌ ${error.message}`);
        }
    };

    const handleNotMastered = async () => {
        const card = cards[currentIndex];

        try {
            const { error } = await supabase
                .from('my_vocab')
                .update({
                    review_count: card.review_count + 1,
                })
                .eq('id', card.id);

            if (error) throw error;

            moveToNext();
        } catch (error: any) {
            setMessage(`❌ ${error.message}`);
        }
    };

    const moveToNext = () => {
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setIsFlipped(false);
            setMessage('');
        } else {
            setMessage('🎉 Bravo! Tu as fini la révision!');
            setTimeout(() => {
                window.location.href = '/vocabulary';
            }, 2000);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
                <div className="text-center">
                    <div className="text-5xl animate-pulse mb-4">📚</div>
                    <p className="text-gray-600">Chargement...</p>
                </div>
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">🎉 Tous tes mots sont maîtrisés!</h1>
                    <Link
                        href="/vocabulary"
                        className="text-blue-600 hover:text-blue-800 font-semibold"
                    >
                        ← Retour à ton vocabulaire
                    </Link>
                </div>
            </div>
        );
    }

    const currentCard = cards[currentIndex];
    const progress = ((currentIndex + 1) / cards.length) * 100;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 pb-28">
            <div className="max-w-2xl mx-auto">
                {/* Header with Pinyin Button */}
                <div className="mb-8 flex justify-between items-start">
                    <div>
                        <Link
                            href="/vocabulary"
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
                        >
                            ← Retour
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">Révision du Vocabulaire</h1>
                        <p className="text-gray-600">
                            {currentIndex + 1} / {cards.length}
                        </p>
                    </div>
                    <button
                        onClick={handleGeneratePinyin}
                        disabled={isGeneratingPinyin}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                        title="Générer le pinyin pour tous les mots chinois"
                    >
                        {isGeneratingPinyin ? '⏳ Génération...' : '🔤 Générer Pinyin'}
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="bg-gray-200 rounded-full h-2 mb-8">
                    <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>

                {/* Message */}
                {message && (
                    <div
                        className={`text-center font-semibold mb-6 p-3 rounded-lg ${message.includes('✅') || message.includes('🎉')
                                ? 'bg-green-100 text-green-700'
                                : message.includes('⏳')
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-red-100 text-red-700'
                            }`}
                    >
                        {message}
                    </div>
                )}

                {/* Flashcard */}
                <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="bg-white rounded-3xl shadow-2xl p-12 mb-8 cursor-pointer min-h-80 flex flex-col justify-center items-center transform transition-transform duration-300 hover:scale-105"
                >
                    {!isFlipped ? (
                        // Face 1: Mot + Phrase d'exemple
                        <div className="text-center">
                            <p className="text-gray-500 text-sm mb-6">📖 Le Mot</p>
                            <h2 className="text-6xl font-bold text-blue-600 mb-4">{currentCard.word}</h2>
                            {currentCard.pinyin && (
                                <p className="text-xl text-purple-600 font-semibold mb-4">
                                    {currentCard.pinyin}
                                </p>
                            )}
                            <p className="text-lg text-gray-700 italic mb-8">
                                "{currentCard.example_phrase}"
                            </p>
                            <p className="text-gray-400 text-xs">Clique pour voir la traduction</p>
                        </div>
                    ) : (
                        // Face 2: Définition
                        <div className="text-center">
                            <p className="text-gray-500 text-sm mb-6">📚 Définition</p>
                            <p className="text-xl text-gray-800 leading-relaxed">
                                {currentCard.definition}
                            </p>
                            <p className="text-gray-400 text-xs mt-8">Clique pour voir le mot</p>
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={handleNotMastered}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-6 rounded-xl transition text-lg active:scale-95"
                    >
                        ❌ Pas encore
                    </button>
                    <button
                        onClick={handleMastered}
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition text-lg active:scale-95"
                    >
                        ✅ C'est bon!
                    </button>
                </div>

                {/* Stats */}
                <div className="mt-8 bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
                    <p className="text-gray-600 text-sm">
                        Fois révisé: <span className="font-bold text-blue-600">{currentCard.review_count}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}