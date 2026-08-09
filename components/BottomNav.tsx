'use client'

import Link from 'next/link'

interface BottomNavProps {
    active: 'home' | 'cards' | 'add' | 'lesson'
}

export default function BottomNav({ active }: BottomNavProps) {
    return (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-around z-50">
            <Link href="/">
                <button className={`flex flex-col items-center gap-1 ${active === 'home' ? 'text-teal-500' : 'text-gray-400'}`}>
                    <span className="text-2xl">🏠</span>
                    <span className="text-xs font-medium">Home</span>
                </button>
            </Link>
            <Link href="/add">
                <button className={`flex flex-col items-center gap-1 ${active === 'add' ? 'text-teal-500' : 'text-gray-400'}`}>
                    <span className="text-2xl">➕</span>
                    <span className="text-xs font-medium">Add Card</span>
                </button>
            </Link>
            <Link href="/cards">
                <button className={`flex flex-col items-center gap-1 ${active === 'cards' ? 'text-teal-500' : 'text-gray-400'}`}>
                    <span className="text-2xl">🀄</span>
                    <span className="text-xs font-medium">My Cards</span>
                </button>
            </Link>
            <Link href="/lesson">
                <button className={`flex flex-col items-center gap-1 ${active === 'lesson' ? 'text-teal-500' : 'text-gray-400'}`}>
                    <span className="text-2xl">🎓</span>
                    <span className="text-xs font-medium">Daily Lesson</span>
                </button>
            </Link>
        </div>
    )
}
