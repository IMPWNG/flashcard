'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'
import Link from 'next/link';

interface VocabCard {
    id: string;
    word: string;
    definition: string;
    example_phrase: string;
    is_mastered: boolean;
    created_at: string;
    review_count: number;
}

export default function VocabularyPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
    const [isLoadingCards, setIsLoadingCards] = useState(true);

    // Form state
    const [formData, setFormData] = useState({
        word: '',
        definition: '',
        example_phrase: '',
    });

    // Fetch cards
    useEffect(() => {
        loadCards();
    }, []);

    const loadCards = async () => {
        try {
            setIsLoadingCards(true);

            const { data, error } = await supabase
                .from('my_vocab')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error:', error);
                setMessage(`❌ Erreur: ${error.message}`);
                return;
            }

            setVocabCards(data || []);
            setMessage('');
        } catch (error) {
            console.error('Error loading cards:', error);
            setMessage('❌ Erreur au chargement');
        } finally {
            setIsLoadingCards(false);
        }
    };

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleAddCard = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.word.trim() || !formData.definition.trim() || !formData.example_phrase.trim()) {
            setMessage('⚠️ Tous les champs sont requis');
            return;
        }

        try {
            setIsLoading(true);

            const { error } = await supabase
                .from('my_vocab')
                .insert([
                    {
                        word: formData.word.trim(),
                        definition: formData.definition.trim(),
                        example_phrase: formData.example_phrase.trim(),
                        is_mastered: false,
                        review_count: 0,
                    },
                ]);

            if (error) {
                console.error('Insert error:', error);
                setMessage(`❌ ${error.message}`);
                return;
            }

            setMessage('✅ Mot ajouté avec succès!');
            setFormData({ word: '', definition: '', example_phrase: '' });
            await loadCards();

            setTimeout(() => setMessage(''), 3000);
        } catch (error: any) {
            console.error('Error:', error);
            setMessage(`❌ ${error.message || 'Erreur'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteCard = async (id: string) => {
        if (!confirm('Sûr de vouloir supprimer ce mot?')) return;

        try {
            const { error } = await supabase.from('my_vocab').delete().eq('id', id);
            if (error) throw error;

            setMessage('✅ Mot supprimé');
            await loadCards();
            setTimeout(() => setMessage(''), 2000);
        } catch (error: any) {
            setMessage(`❌ ${error.message}`);
        }
    };

    const nonMasteredCount = vocabCards.filter((card) => !card.is_mastered).length;

    if (isLoadingCards) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="text-5xl animate-pulse">📚</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 pb-28">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
                    >
                        ← Retour Home
                    </Link>
                    <h1 className="text-4xl font-bold text-gray-800 mb-2">Mon Vocabulaire Personnel</h1>
                    <p className="text-gray-600">Ajoute et révise ton propre vocabulaire quotidien</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                        <p className="text-gray-600 text-sm">Total de mots</p>
                        <p className="text-3xl font-bold text-gray-800">{vocabCards.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                        <p className="text-gray-600 text-sm">À réviser</p>
                        <p className="text-3xl font-bold text-blue-600">{nonMasteredCount}</p>
                    </div>
                </div>

                {/* Form */}
                <div className="bg-white rounded-3xl p-8 shadow-lg mb-8 border border-gray-100">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Ajouter un nouveau mot</h2>

                    {message && (
                        <p
                            className={`text-sm font-semibold mb-4 p-3 rounded-lg ${message.includes('✅')
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                                }`}
                        >
                            {message}
                        </p>
                    )}

                    <form onSubmit={handleAddCard} className="space-y-4">
                        <div>
                            <label className="block text-gray-700 font-semibold mb-2">Mot / Expression</label>
                            <input
                                type="text"
                                name="word"
                                value={formData.word}
                                onChange={handleInputChange}
                                placeholder="Ex: serendipity"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-gray-700 font-semibold mb-2">Définition</label>
                            <textarea
                                name="definition"
                                value={formData.definition}
                                onChange={handleInputChange}
                                placeholder="Ex: The occurrence and development of events by chance in a happy or beneficial way"
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-gray-700 font-semibold mb-2">Phrase d'exemple</label>
                            <textarea
                                name="example_phrase"
                                value={formData.example_phrase}
                                onChange={handleInputChange}
                                placeholder="Ex: Meeting my best friend was a moment of pure serendipity."
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
                        >
                            {isLoading ? '⏳ Ajout en cours...' : '➕ Ajouter le mot'}
                        </button>
                    </form>
                </div>

                {/* Vocab List */}
                <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Mes mots ({vocabCards.length})</h2>
                        {nonMasteredCount > 0 && (
                            <Link
                                href="/vocabulary/review"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition"
                            >
                                📚 Réviser ({nonMasteredCount})
                            </Link>
                        )}
                    </div>

                    {vocabCards.length === 0 ? (
                        <p className="text-gray-600 text-center py-8">Aucun mot pour le moment. Ajoute-en un!</p>
                    ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {vocabCards.map((card) => (
                                <div
                                    key={card.id}
                                    className={`p-4 border rounded-lg flex justify-between items-start ${card.is_mastered
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-gray-50 border-gray-200'
                                        }`}
                                >
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800">{card.word}</p>
                                        <p className="text-sm text-gray-600 mt-1">{card.definition}</p>
                                        <p className="text-xs text-gray-500 italic mt-2">
                                            "{card.example_phrase}"
                                        </p>
                                        <p className="text-xs text-gray-500 mt-2">
                                            {card.is_mastered ? '✅ Maîtrisé' : `📖 ${card.review_count} révisions`}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteCard(card.id)}
                                        className="ml-4 text-red-600 hover:text-red-800 font-bold text-sm"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}