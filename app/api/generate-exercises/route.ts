// app/api/generate-exercises/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const MAMMOUTH_URL = "https://api.mammouth.ai/v1/chat/completions";

// ─────────────────────────────────────────────
// Helper : appel générique à l'API Mammouth
// ─────────────────────────────────────────────
async function callAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt?: string,
) {
  const messages: any[] = [{ role: "system", content: systemPrompt }];
  if (userPrompt) messages.push({ role: "user", content: userPrompt });

  const res = await fetch(MAMMOUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0.7,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API error: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

// ─────────────────────────────────────────────
// Helper : extraire un JSON (objet ou tableau) d'une réponse
// ─────────────────────────────────────────────
function extractJSON(content: string): any {
  const arrMatch = content.match(/\[[\s\S]*\]/);
  const objMatch = content.match(/\{[\s\S]*\}/);
  const raw = arrMatch?.[0] ?? objMatch?.[0];
  if (!raw) throw new Error("No JSON found in response");
  return JSON.parse(raw);
}

// ─────────────────────────────────────────────
// Helper : mélanger un array (Fisher-Yates shuffle)
// ─────────────────────────────────────────────
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─────────────────────────────────────────────
// Helper : sélectionner N items aléatoires d'un array
// ─────────────────────────────────────────────
function randomSelect<T>(array: T[], count: number): T[] {
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, Math.min(count, array.length));
}

// ─────────────────────────────────────────────
// PASSE 1 : prompt de génération
// ─────────────────────────────────────────────
function buildGenerationPrompt(count: number, flashcardsData: string) {
  return `Tu es un expert en didactique du chinois mandarin (HSK + linguistique appliquée).
Ta mission : générer EXACTEMENT ${count} exercices de phrases à trous (QCM) de très haute qualité,
conçus pour faire RÉVISER activement les mots fournis et renforcer leur mémorisation en contexte.

═══════════════════════════════════
LISTE DE MOTS À RÉVISER (source unique du trou)
═══════════════════════════════════
${flashcardsData}

═══════════════════════════════════
OBJECTIF PÉDAGOGIQUE
═══════════════════════════════════
- Le MOT TESTÉ (la bonne réponse) DOIT obligatoirement provenir de la liste ci-dessus.
- Chaque phrase doit créer un CONTEXTE FORT qui rend la bonne réponse UNIQUE et ÉVIDENTE
  une fois comprise, mais NON DEVINABLE sans connaître le mot.
- Les phrases doivent être NATURELLES, UTILES et RÉALISTES.
- Varie les thèmes, les structures grammaticales et les registres.

═══════════════════════════════════
RÈGLES DE CONSTRUCTION
═══════════════════════════════════
1. UN SEUL trou "___" par phrase.
2. La phrase DOIT contenir des INDICES CONTEXTUELS (cause, conséquence, temps, lieu,
   collocation, logique) qui ne laissent qu'UNE réponse correcte.
   ⚠️ INTERDIT : une phrase générique où plusieurs choix marcheraient
   (ex : "今天你想去___吗？" est INVALIDE car maison/école/gare/hôpital marchent tous).
3. Longueur cible : 8 à 20 caractères.
4. N'introduis pas de vocabulaire plus rare que le mot testé.
5. Privilégie une COLLOCATION ou STRUCTURE typique.

═══════════════════════════════════
RÈGLES DES 4 CHOIX
═══════════════════════════════════
1. EXACTEMENT 4 choix, 1 seul correct.
2. Même catégorie grammaticale ET sémantique.
3. Distracteurs : grammaticalement valides, plausibles au 1er regard,
   mais LOGIQUEMENT INCORRECTS dans CE contexte.
4. INTERDIT : plusieurs réponses correctes, synonyme de la réponse,
   distracteur absurde, catégorie différente.
5. Mélange l'ordre des choix.

═══════════════════════════════════
TEST DE SUBSTITUTION (obligatoire)
═══════════════════════════════════
Pour chaque exercice, insère MENTALEMENT chacun des 3 distracteurs dans la phrase.
Si l'un d'eux produit une phrase correcte ET logique → l'exercice est AMBIGU → réécris-le
en RENFORÇANT le contexte jusqu'à ce qu'une seule réponse soit possible.

═══════════════════════════════════
FORMAT DE SORTIE (STRICT)
═══════════════════════════════════
Réponds UNIQUEMENT avec le tableau JSON valide, sans texte ni markdown.

[
  {
    "sentence_with_blank": "string",
    "sentence_pinyin": "string",
    "sentence_french": "string",
    "choices": ["string", "string", "string", "string"],
    "correct_answer": "string",
    "answer_pinyin": "string",
    "answer_translation": "string",
    "explanation": "string",
    "difficulty": 1
  }
]`;
}

// ─────────────────────────────────────────────
// PASSE 2 : prompt du JUGE / validateur
// ─────────────────────────────────────────────
function buildValidationPrompt() {
  return `Tu es un correcteur STRICT de QCM de chinois mandarin.
On va te donner un tableau JSON d'exercices. Pour CHAQUE exercice :

1. Insère TOUR À TOUR chacun des 4 "choices" dans "sentence_with_blank".
2. Pour chaque choix, juge si la phrase obtenue est À LA FOIS grammaticale,
   naturelle ET logiquement cohérente (réponds "OUI" ou "NON").
3. Compte le nombre de "OUI".
   - Si nombre_de_OUI > 1  → l'exercice est AMBIGU → "valide": false
   - Si la réponse "correct_answer" donne "NON"      → "valide": false
   - Si "correct_answer" n'est pas EXACTEMENT dans "choices" → "valide": false
   - Sinon → "valide": true

Réponds UNIQUEMENT avec un tableau JSON, dans le MÊME ORDRE que les exercices reçus,
sans texte ni markdown :

[
  {
    "index": 0,
    "evaluation": { "<choix1>": "OUI/NON", "<choix2>": "OUI/NON", "<choix3>": "OUI/NON", "<choix4>": "OUI/NON" },
    "nombre_de_OUI": 1,
    "valide": true,
    "raison": "courte explication"
  }
]`;
}

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Generate Exercises API called");

    const MAMMOUTH_API_KEY = process.env.MAMMOUTH_API_KEY;
    if (!MAMMOUTH_API_KEY) {
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    const { count = 5 } = await req.json();

    // ✅ 1. Récupérer TOUS les flashcards en phase reviewing ou mastered
    const { data: allFlashcards, error: dbError } = await supabase
      .from("flashcards")
      .select("id, character, pinyin, translation, definition, examples")
      .in("phase", ["reviewing", "mastered"]);

    if (dbError) {
      console.error("❌ Database error:", dbError);
      return NextResponse.json(
        { error: "Failed to fetch flashcards", details: dbError.message },
        { status: 500 },
      );
    }

    if (!allFlashcards || allFlashcards.length === 0) {
      return NextResponse.json(
        { error: "No reviewed or mastered flashcards found" },
        { status: 404 },
      );
    }

    console.log(`📚 Found ${allFlashcards.length} total flashcards in DB`);

    // ✅ 2. Sélectionner aléatoirement des flashcards (30-50 pour la génération)
    const selectedForGeneration = randomSelect(
      allFlashcards,
      Math.max(30, count * 5),
    );
    console.log(
      `🎲 Selected ${selectedForGeneration.length} random flashcards for generation`,
    );

    const flashcardsData = selectedForGeneration
      .map(
        (card) =>
          `- 字: ${card.character} (${card.pinyin}) - Traduction: ${card.translation}\n  Définition: ${card.definition}`,
      )
      .join("\n");

    // ─────────────────────────────────────────
    // BOUCLE : générer jusqu'à obtenir `count` exos VALIDES
    // (max 3 tentatives pour éviter une boucle infinie)
    // ─────────────────────────────────────────
    const validExercises: any[] = [];
    const MAX_ATTEMPTS = 3;

    for (
      let attempt = 1;
      attempt <= MAX_ATTEMPTS && validExercises.length < count;
      attempt++
    ) {
      const needed = count - validExercises.length;
      console.log(`📡 Génération tentative ${attempt} (besoin de ${needed})`);

      // ── PASSE 1 : génération ──
      let generated: any[];
      try {
        const genContent = await callAI(
          MAMMOUTH_API_KEY,
          buildGenerationPrompt(needed, flashcardsData),
        );
        generated = extractJSON(genContent);
        if (!Array.isArray(generated))
          throw new Error("Generation is not an array");
        console.log(`✅ ${generated.length} exos générés`);
      } catch (e) {
        console.warn("⚠️ Échec génération:", e);
        continue;
      }

      // Pré-filtre structurel (avant de payer la passe 2)
      generated = generated.filter((ex: any) => {
        const okChoices = Array.isArray(ex.choices) && ex.choices.length === 4;
        const okAnswer =
          ex.correct_answer && ex.choices?.includes(ex.correct_answer);
        const okFields =
          ex.sentence_with_blank &&
          ex.sentence_pinyin &&
          ex.sentence_french &&
          ex.answer_pinyin &&
          ex.answer_translation &&
          ex.explanation;
        if (!okChoices || !okAnswer || !okFields) {
          console.warn("⚠️ Pré-filtre échoué:", ex.sentence_with_blank);
          return false;
        }
        return true;
      });

      if (generated.length === 0) continue;

      // ── PASSE 2 : validation par le juge ──
      let verdicts: any[] = [];
      try {
        const valContent = await callAI(
          MAMMOUTH_API_KEY,
          buildValidationPrompt(),
          JSON.stringify(generated),
        );
        verdicts = extractJSON(valContent);
        if (!Array.isArray(verdicts)) throw new Error("Verdicts not an array");
      } catch (e) {
        console.warn("⚠️ Échec validation (passe 2), on rejette le lot:", e);
        continue;
      }

      // ── Croiser génération + verdicts ──
      generated.forEach((ex: any, i: number) => {
        const verdict = verdicts.find((v) => v.index === i) ?? verdicts[i];
        if (verdict && verdict.valide === true) {
          validExercises.push(ex);
          console.log(`✅ Exo validé: ${ex.sentence_with_blank}`);
        } else {
          console.warn(
            `❌ Exo rejeté par le juge: "${ex.sentence_with_blank}" — ${verdict?.raison ?? "no verdict"}`,
          );
        }
      });
    }

    if (validExercises.length === 0) {
      return NextResponse.json(
        {
          error: "No valid exercises generated",
          details: "Tous les exercices ont été rejetés par le validateur",
        },
        { status: 500 },
      );
    }

    // On garde au maximum `count` exos
    const finalExercises = validExercises.slice(0, count);
    console.log(`✅ ${finalExercises.length} exercices valides retenus`);

    // ✅ Mapper pour insertion BDD
    const exercisesToInsert = finalExercises.map((exercise: any) => {
      const associatedFlashcards = selectedForGeneration
        .filter((card) =>
          exercise.correct_answer
            .toLowerCase()
            .includes(card.character.toLowerCase()),
        )
        .map((card) => card.id);

      return {
        sentence_with_blank: exercise.sentence_with_blank,
        sentence_pinyin: exercise.sentence_pinyin,
        sentence_french: exercise.sentence_french,
        choices: exercise.choices,
        correct_answer: exercise.correct_answer,
        answer_pinyin: exercise.answer_pinyin,
        answer_translation: exercise.answer_translation,
        explanation: exercise.explanation,
        ai_explanation: exercise.explanation,
        flashcard_ids:
          associatedFlashcards.length > 0
            ? associatedFlashcards
            : [selectedForGeneration[0].id],
        difficulty: exercise.difficulty || 1,
      };
    });

    // ✅ Insérer en BDD
    const { data: insertedExercises, error: insertError } = await supabase
      .from("exercises")
      .insert(exercisesToInsert)
      .select();

    if (insertError) {
      console.error("❌ Insert error:", insertError);
      return NextResponse.json(
        { error: "Database insert failed", details: insertError.message },
        { status: 500 },
      );
    }

    console.log(`✅ ${insertedExercises.length} exercices créés en BDD`);

    return NextResponse.json(
      {
        success: true,
        exercises: insertedExercises,
        count: insertedExercises.length,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
