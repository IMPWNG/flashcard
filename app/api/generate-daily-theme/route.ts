import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Daily Theme API called");

    const MAMMOUTH_API_KEY = process.env.MAMMOUTH_API_KEY;
    if (!MAMMOUTH_API_KEY) {
      console.error("❌ MAMMOUTH_API_KEY is missing");
      return NextResponse.json(
        { error: "API Key not configured" },
        { status: 500 },
      );
    }

    // 1️⃣ CHECK SI UNE THÉMATIQUE EXISTE DÉJÀ AUJOURD'HUI
    const today = new Date().toISOString().split("T")[0];
    const { data: existingTheme } = await supabase
      .from("daily_themes")
      .select("id")
      .eq("generated_date", today)
      .single();

    if (existingTheme) {
      console.log("✅ Theme already exists for today");
      return NextResponse.json(
        {
          message: "Theme already generated for today",
          themeId: existingTheme.id,
        },
        { status: 200 },
      );
    }

    // 2️⃣ LISTE DES THÉMATIQUES POSSIBLES
    const themes = [
      "Introducing yourself and talking about your background",
      "Greeting people and saying goodbye",
      "Talking about your daily routine",
      "Buying fruits and vegetables at the market",
      "Ordering coffee or a drink",
      "Going to the pharmacy",
      "Making an appointment",
      "At the dentist’s office",
      "Renting an apartment",
      "Talking to your landlord",
      "Paying bills",
      "Withdrawing money from an ATM",
      "Getting your phone repaired",
      "Buying a SIM card",
      "Using a mobile app",
      "Calling customer service",
      "Sending or receiving a package",
      "At the post office",
      "Shopping at the market",
      "Asking for the price and bargaining",
      "Buying train or plane tickets",
      "At the airport",
      "Traveling by train",
      "Booking a table",
      "Inviting someone to your home",
      "Talking about your hobbies",
      "Making vacation plans",
      "Expressing your likes and preferences",
      "Talking about your health",
      "Describing a problem or an emergency",
      "Getting to know a colleague",
      "Talking about your job",
      "Taking part in a meeting",
      "Asking for help",
      "Apologizing and thanking someone",
      "Expressing agreement or disagreement",
      "Understanding numbers, dates, and times",
      "Talking about Chinese festivals and traditions",
      "Making purchases at a supermarket",
      "Taking a taxi or ride-sharing",
      "Chatting with friends",
      "Ordering food at a restaurant",
      "At the doctor’s office",
      "Hotel check-in and accommodation",
      "Shopping for clothes",
      "Using public transportation",
      "At the bank",
      "Asking for directions",
      "Small talk with neighbors",
      "Job interview",
      "At the gym or fitness center",
      "Movie theater visit",
      "Online shopping",
      "At the hair salon",
      "Weather conversation",
      "Family gathering",
      "University classroom",
      "Weekend plans",
    ];

    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    console.log(`🎯 Selected theme: ${randomTheme}`);

    // 3️⃣ APPELLE L'IA POUR GÉNÉRER LE CONTENU
    const aiResponse = await fetch(
      "https://api.mammouth.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MAMMOUTH_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          messages: [
            {
              role: "system",
              content: `You are an expert Chinese language teacher specializing in HSK levels from level 2 to level 5. Create comprehensive, practical daily content for language learners. Include vocabulary with proper pinyin and English translations, plus realistic dialogues and isolated phrases that learners can use in their daily life.`,
            },
            {
              role: "user",
              content: `Generate COMPLETE daily Chinese learning content for the theme: "${randomTheme}"

Create a JSON response with:
1. VOCABULARY SECTION: 20-30 useful words/phrases relevant to this theme (HSK levels from level 2 to level 5)
2. PHRASES AND DIALOGUES: Mix of 2-3 realistic dialogues (back-and-forth conversations) and 10-15 isolated useful phrases

Important:
- All Chinese text must be in Simplified Chinese characters
- Provide pinyin with tone marks for EVERY word and phrase
- Provide accurate English translations
- Dialogues should be realistic and practical
- Include various HSK levels (2, 3, 4, 5) mixed throughout
- Make dialogues with multiple exchanges (at least 4-5 exchanges per dialogue)

Respond ONLY with this JSON format (no markdown, no extra text):
{
  "theme_name": "Theme name here",
  "theme_description": "Brief description of the theme",
  "vocabulary": [
    {
      "chinese": "你好",
      "pinyin": "nǐ hǎo",
      "english": "hello",
      "hsk_level": 1
    }
  ],
  "phrases_and_dialogues": [
    {
      "type": "dialogue",
      "speaker": "Person A",
      "chinese": "你今天怎么样？",
      "pinyin": "nǐ jīn tiān zěn me yàng?",
      "english": "How are you today?",
      "hsk_level": 2
    },
    {
      "type": "dialogue",
      "speaker": "Person B",
      "chinese": "我很好，谢谢你问。",
      "pinyin": "wǒ hěn hǎo, xièxie nǐ wèn.",
      "english": "I'm very well, thank you for asking.",
      "hsk_level": 2
    },
    {
      "type": "isolated_phrase",
      "speaker": null,
      "chinese": "请问...多少钱？",
      "pinyin": "qǐng wèn... duō shao qián?",
      "english": "Excuse me, how much is...?",
      "hsk_level": 2
    }
  ]
}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      },
    );

    if (!aiResponse.ok) {
      console.error("❌ Mammouth API error:", aiResponse.statusText);
      return NextResponse.json(
        { error: "Failed to generate theme content" },
        { status: 500 },
      );
    }

    const aiData = await aiResponse.json();
    console.log("✅ Mammouth API response received");

    // 4️⃣ PARSE LA RÉPONSE
    let themeContent;
    const content = aiData.choices[0].message.content;

    try {
      themeContent = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("❌ No JSON found in response");
        return NextResponse.json(
          { error: "Cannot extract JSON from response" },
          { status: 500 },
        );
      }
      themeContent = JSON.parse(jsonMatch[0]);
    }

    console.log("✅ Parsed theme content");

    // 5️⃣ SAUVEGARDE EN BDD
    // Crée la thématique
    const { data: themeData, error: themeError } = await supabase
      .from("daily_themes")
      .insert({
        theme_name: themeContent.theme_name,
        theme_description: themeContent.theme_description,
        generated_date: today,
      })
      .select("id")
      .single();

    if (themeError || !themeData) {
      console.error("❌ Theme creation error:", themeError);
      return NextResponse.json(
        { error: "Failed to create theme" },
        { status: 500 },
      );
    }

    const themeId = themeData.id;
    console.log(`✅ Theme created with ID: ${themeId}`);

    // Sauvegarde le vocabulaire
    if (themeContent.vocabulary && Array.isArray(themeContent.vocabulary)) {
      const vocabData = themeContent.vocabulary.map((vocab: any) => ({
        theme_id: themeId,
        chinese_word: vocab.chinese,
        english_translation: vocab.english,
        pinyin: vocab.pinyin,
        hsk_level: vocab.hsk_level,
      }));

      const { error: vocabError } = await supabase
        .from("theme_vocabulary")
        .insert(vocabData);

      if (vocabError) {
        console.error("❌ Vocabulary insert error:", vocabError);
      } else {
        console.log(`✅ Saved ${vocabData.length} vocabulary items`);
      }
    }

    // Sauvegarde les phrases et dialogues
    if (
      themeContent.phrases_and_dialogues &&
      Array.isArray(themeContent.phrases_and_dialogues)
    ) {
      const phrasesData = themeContent.phrases_and_dialogues.map(
        (phrase: any, index: number) => ({
          theme_id: themeId,
          phrase_type: phrase.type,
          speaker: phrase.speaker || null,
          chinese_text: phrase.chinese,
          english_translation: phrase.english,
          pinyin: phrase.pinyin,
          hsk_level: phrase.hsk_level,
          phrase_order: index,
        }),
      );

      const { error: phrasesError } = await supabase
        .from("theme_phrases")
        .insert(phrasesData);

      if (phrasesError) {
        console.error("❌ Phrases insert error:", phrasesError);
      } else {
        console.log(`✅ Saved ${phrasesData.length} phrases and dialogues`);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Theme generated successfully for ${today}`,
        themeId: themeId,
        themeName: themeContent.theme_name,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
