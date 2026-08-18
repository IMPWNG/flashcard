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
}

export default function VocabularyReviewPage() {
    const [cards, setCards] = useState<VocabCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
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

            console.log('Cards loaded:', data); // DEBUG
            setCards(data || []);
        } catch (error) {
            console.error('Error:', error);
            setMessage('❌ Erreur au chargement');
        } finally {
            setIsLoading(false);
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
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="mb-8">
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
                        <div className="text-center">
                            <p className="text-gray-500 text-sm mb-4">📖 Le Mot</p>
                            <h2 className="text-5xl font-bold text-blue-600 mb-4">{currentCard.word}</h2>
                            <p className="text-gray-600 text-lg">{currentCard.definition}</p>
                            <p className="text-gray-400 text-xs mt-8">Clique pour voir la phrase d'exemple</p>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-gray-500 text-sm mb-4">📝 Phrase d'exemple</p>
                            <p className="text-xl text-gray-800 italic leading-relaxed">
                                "{currentCard.example_phrase}"
                            </p>
                            <p className="text-gray-400 text-xs mt-8">Clique pour voir le mot</p>
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={handleNotMastered}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-6 rounded-xl transition text-lg"
                    >
                        ❌ Pas encore
                    </button>
                    <button
                        onClick={handleMastered}
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition text-lg"
                    >
                        ✅ C'est bon!
                    </button>
                </div>

                {/* Stats */}
                <div className="mt-8 bg-white rounded-2xl p-4 shadow-sm border border-gray-200 text-center">
                    <p className="text-gray-600 text-sm">
                        Fois révisé: <span className="font-bold">{currentCard.review_count}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}