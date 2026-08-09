// components/PieChart.tsx
interface Props {
    new_: number
    learning: number
    reviewing: number
    mastered: number
}

export default function PieChart({ new_, learning, reviewing, mastered }: Props) {
    const size = 100
    const cx = size / 2
    const cy = size / 2
    const r = 38

    const total = new_ + learning + reviewing + mastered

    function getCoords(pct: number) {
        const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2
        return {
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
        }
    }

    function slice(startPct: number, endPct: number, color: string, key: string) {
        if (endPct - startPct <= 0) return null
        if (endPct - startPct >= 99.9) {
            return <circle key={key} cx={cx} cy={cy} r={r} fill={color} />
        }
        const start = getCoords(startPct)
        const end = getCoords(endPct)
        const largeArc = endPct - startPct > 50 ? 1 : 0
        return (
            <path
                key={key}
                d={`M${cx},${cy} L${start.x},${start.y} A${r},${r} 0 ${largeArc},1 ${end.x},${end.y} Z`}
                fill={color}
            />
        )
    }

    if (total === 0) {
        return (
            <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
                <circle cx={cx} cy={cy} r={r} fill="#F3F4F6" />
                <circle cx={cx} cy={cy} r={22} fill="white" />
            </svg>
        )
    }

    const masteredPct = (mastered / total) * 100
    const reviewingPct = (reviewing / total) * 100
    const learningPct = (learning / total) * 100
    const newPct = (new_ / total) * 100

    const slices = [
        { start: 0, end: masteredPct, color: '#10B981', key: 'mastered' },
        { start: masteredPct, end: masteredPct + reviewingPct, color: '#FBBF24', key: 'reviewing' },
        { start: masteredPct + reviewingPct, end: masteredPct + reviewingPct + learningPct, color: '#3B82F6', key: 'learning' },
        { start: masteredPct + reviewingPct + learningPct, end: 100, color: '#E5E7EB', key: 'new' },
    ]

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
            {slices.map(s => slice(s.start, s.end, s.color, s.key))}
            <circle cx={cx} cy={cy} r={22} fill="white" />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="bold" fill="#111827">
                {total}
            </text>
        </svg>
    )
}
