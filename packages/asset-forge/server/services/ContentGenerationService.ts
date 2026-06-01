/**
 * Content Generation Service
 * AI-powered content generation for NPCs, quests, dialogue, and lore
 */

import {
  chatProviderService,
  type ChatProviderQuality,
} from "./ChatProviderService";

export interface DialogueNode {
  id: string;
  text: string;
  responses?: Array<{
    text: string;
    nextNodeId?: string;
  }>;
}

export interface NPCData {
  name: string;
  archetype: string;
  personality: {
    traits: string[];
    background: string;
    motivations: string[];
  };
  appearance: {
    description: string;
    equipment: string[];
  };
  dialogue: {
    greeting: string;
    farewell: string;
    idle: string[];
  };
  behavior: {
    role: string;
    schedule: string;
    relationships: string[];
  };
}

export interface QuestObjective {
  description: string;
  type: "kill" | "collect" | "talk" | "explore";
  target: string;
  count: number;
}

export interface QuestData {
  title: string;
  description: string;
  objectives: QuestObjective[];
  rewards: {
    experience: number;
    gold: number;
    items: string[];
  };
  requirements: {
    level: number;
    previousQuests: string[];
  };
  npcs: string[];
  location: string;
  story: string;
}

export interface LoreData {
  title: string;
  category: string;
  content: string;
  summary: string;
  relatedTopics: string[];
  timeline?: string;
  characters?: string[];
}

export class ContentGenerationService {
  public readonly isEnabled: boolean;

  constructor() {
    this.isEnabled = chatProviderService.isEnabled;

    if (this.isEnabled) {
      console.log(
        `[ContentGenerationService] Initialized with ${chatProviderService.providerName}`,
      );
    } else {
      console.log(
        "[ContentGenerationService] No chat provider found - content generation disabled",
      );
    }
  }

  private checkEnabled(): void {
    if (!this.isEnabled) {
      throw new Error(
        "ASSET_FORGE_CHAT_PROVIDER=hyades, AI_GATEWAY_API_KEY, or OPENAI_API_KEY required for Content Generation Service",
      );
    }
  }

  /**
   * Get model string for quality level.
   */
  private getModel(quality: ChatProviderQuality): string {
    return chatProviderService.getModelName(quality);
  }

  private async generateText(params: {
    prompt: string;
    quality: ChatProviderQuality;
    temperature: number;
    threadId: string;
  }): Promise<string> {
    const result = await chatProviderService.complete(
      {
        consumer: "hyperscape-content",
        messages: [{ role: "user", content: params.prompt }],
        temperature: params.temperature,
        threadId: params.threadId,
      },
      params.quality,
    );
    return result.text;
  }

  /**
   * Generate NPC dialogue tree nodes
   */
  async generateDialogue(params: {
    npcName: string;
    npcPersonality: string;
    context?: string;
    existingNodes?: DialogueNode[];
    quality?: "quality" | "speed" | "balanced";
  }): Promise<{
    nodes: DialogueNode[];
    rawResponse: string;
  }> {
    this.checkEnabled();

    const {
      npcName,
      npcPersonality,
      context,
      existingNodes = [],
      quality = "speed",
    } = params;

    const prompt = this.buildDialoguePrompt(
      npcName,
      npcPersonality,
      context || "",
      existingNodes,
    );

    console.log(`[ContentGeneration] Generating dialogue for NPC: ${npcName}`);

    const text = await this.generateText({
      quality,
      prompt,
      temperature: 0.8,
      threadId: `hyperscape:dialogue:${npcName}`,
    });

    const nodes = this.parseDialogueResponse(text);

    console.log(`[ContentGeneration] Generated ${nodes.length} dialogue nodes`);

    return {
      nodes,
      rawResponse: text,
    };
  }

  /**
   * Generate complete NPC character
   */
  async generateNPC(params: {
    archetype: string;
    prompt: string;
    context?: string;
    quality?: "quality" | "speed" | "balanced";
  }): Promise<{
    npc: NPCData & { id: string; metadata: Record<string, unknown> };
    rawResponse: string;
  }> {
    this.checkEnabled();

    const {
      archetype,
      prompt: userPrompt,
      context,
      quality = "quality",
    } = params;

    const model = this.getModel(quality);

    const aiPrompt = this.buildNPCPrompt(archetype, userPrompt, context);

    console.log(
      `[ContentGeneration] Generating NPC with archetype: ${archetype}`,
    );

    const text = await this.generateText({
      quality,
      prompt: aiPrompt,
      temperature: 0.8,
      threadId: `hyperscape:npc:${archetype}:${userPrompt.slice(0, 48)}`,
    });

    const npcData = this.parseNPCResponse(text);

    const completeNPC = {
      id: `npc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...npcData,
      metadata: {
        generatedBy: "AI",
        model,
        provider: chatProviderService.providerName,
        timestamp: new Date().toISOString(),
        archetype,
      },
    };

    console.log(`[ContentGeneration] Generated NPC: ${completeNPC.name}`);

    return {
      npc: completeNPC,
      rawResponse: text,
    };
  }

  /**
   * Generate game quest
   */
  async generateQuest(params: {
    questType: string;
    difficulty: string;
    theme?: string;
    context?: string;
    quality?: "quality" | "speed" | "balanced";
  }): Promise<{
    quest: QuestData & {
      id: string;
      difficulty: string;
      questType: string;
      metadata: Record<string, unknown>;
    };
    rawResponse: string;
  }> {
    this.checkEnabled();

    const {
      questType,
      difficulty,
      theme,
      context,
      quality = "quality",
    } = params;

    const model = this.getModel(quality);

    const aiPrompt = this.buildQuestPrompt(
      questType,
      difficulty,
      theme,
      context,
    );

    console.log(
      `[ContentGeneration] Generating ${difficulty} ${questType} quest`,
    );

    const text = await this.generateText({
      quality,
      prompt: aiPrompt,
      temperature: 0.7,
      threadId: `hyperscape:quest:${questType}:${theme || difficulty}`,
    });

    const questData = this.parseQuestResponse(text);

    const completeQuest = {
      id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...questData,
      difficulty,
      questType,
      metadata: {
        generatedBy: "AI",
        model,
        provider: chatProviderService.providerName,
        timestamp: new Date().toISOString(),
      },
    };

    console.log(`[ContentGeneration] Generated quest: ${completeQuest.title}`);

    return {
      quest: completeQuest,
      rawResponse: text,
    };
  }

  /**
   * Generate lore content
   */
  async generateLore(params: {
    category: string;
    topic: string;
    context?: string;
    quality?: "quality" | "speed" | "balanced";
  }): Promise<{
    lore: LoreData & { id: string; metadata: Record<string, unknown> };
    rawResponse: string;
  }> {
    this.checkEnabled();

    const { category, topic, context, quality = "balanced" } = params;

    const model = this.getModel(quality);

    const aiPrompt = this.buildLorePrompt(category, topic, context);

    console.log(
      `[ContentGeneration] Generating lore for: ${category} - ${topic}`,
    );

    const text = await this.generateText({
      quality,
      prompt: aiPrompt,
      temperature: 0.7,
      threadId: `hyperscape:lore:${category}:${topic}`,
    });

    const loreData = this.parseLoreResponse(text);

    const completeLore = {
      id: `lore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...loreData,
      metadata: {
        generatedBy: "AI",
        model,
        provider: chatProviderService.providerName,
        timestamp: new Date().toISOString(),
      },
    };

    console.log(`[ContentGeneration] Generated lore: ${completeLore.title}`);

    return {
      lore: completeLore,
      rawResponse: text,
    };
  }

  // ============================================================================
  // Prompt Building
  // ============================================================================

  private buildDialoguePrompt(
    npcName: string,
    personality: string,
    context: string,
    existingNodes: DialogueNode[],
  ): string {
    return `You are a dialogue writer for an RPG game. Generate dialogue tree nodes for an NPC.

NPC Name: ${npcName}
Personality: ${personality}
${context ? `Context: ${context}` : ""}
${existingNodes.length > 0 ? `Existing Nodes: ${JSON.stringify(existingNodes, null, 2)}` : ""}

Generate 3-5 dialogue nodes in JSON format:
[
  {
    "id": "unique_id",
    "text": "dialogue text",
    "responses": [
      {"text": "player response", "nextNodeId": "next_node_id"}
    ]
  }
]

Return ONLY the JSON array, no explanation.`;
  }

  private buildNPCPrompt(
    archetype: string,
    userPrompt: string,
    context?: string,
  ): string {
    return `You are an NPC character designer for an RPG game. Generate a complete NPC character.

Archetype: ${archetype}
Requirements: ${userPrompt}
${context ? `Context: ${context}` : ""}

Generate a complete NPC in JSON format:
{
  "name": "NPC Name",
  "archetype": "${archetype}",
  "personality": {
    "traits": ["trait1", "trait2", "trait3"],
    "background": "background story",
    "motivations": ["motivation1", "motivation2"]
  },
  "appearance": {
    "description": "physical description",
    "equipment": ["item1", "item2"]
  },
  "dialogue": {
    "greeting": "greeting text",
    "farewell": "farewell text",
    "idle": ["idle line 1", "idle line 2"]
  },
  "behavior": {
    "role": "their role in the world",
    "schedule": "daily routine",
    "relationships": []
  }
}

Return ONLY the JSON object, no explanation.`;
  }

  private buildQuestPrompt(
    questType: string,
    difficulty: string,
    theme?: string,
    context?: string,
  ): string {
    return `You are a quest designer for an RPG game. Generate a complete quest.

Quest Type: ${questType}
Difficulty: ${difficulty}
${theme ? `Theme: ${theme}` : ""}
${context ? `Context: ${context}` : ""}

Generate a quest in JSON format:
{
  "title": "Quest Title",
  "description": "Quest description",
  "objectives": [
    {"description": "objective 1", "type": "kill|collect|talk|explore", "target": "target", "count": 1}
  ],
  "rewards": {
    "experience": 100,
    "gold": 50,
    "items": ["item1"]
  },
  "requirements": {
    "level": 1,
    "previousQuests": []
  },
  "npcs": ["NPC Name"],
  "location": "Location Name",
  "story": "Quest narrative"
}

Return ONLY the JSON object, no explanation.`;
  }

  private buildLorePrompt(
    category: string,
    topic: string,
    context?: string,
  ): string {
    return `You are a lore writer for an RPG game. Generate rich lore content.

Category: ${category}
Topic: ${topic}
${context ? `Context: ${context}` : ""}

Generate lore content in JSON format:
{
  "title": "Lore Title",
  "category": "${category}",
  "content": "Detailed lore content (2-3 paragraphs)",
  "summary": "Brief summary (1-2 sentences)",
  "relatedTopics": ["topic1", "topic2"],
  "timeline": "When this occurs in the game world (optional)",
  "characters": ["character1", "character2"] (if applicable)
}

Return ONLY the JSON object, no explanation.`;
  }

  // ============================================================================
  // Response Parsing
  // ============================================================================

  private parseDialogueResponse(text: string): DialogueNode[] {
    try {
      let cleaned = this.cleanJSONResponse(text);
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.error("[Parse Error] Failed to parse dialogue response:", error);
      throw new Error("Invalid JSON response from AI");
    }
  }

  private parseNPCResponse(text: string): NPCData {
    try {
      let cleaned = this.cleanJSONResponse(text);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("[Parse Error] Failed to parse NPC response:", error);
      throw new Error("Invalid JSON response from AI");
    }
  }

  private parseQuestResponse(text: string): QuestData {
    try {
      let cleaned = this.cleanJSONResponse(text);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("[Parse Error] Failed to parse quest response:", error);
      throw new Error("Invalid JSON response from AI");
    }
  }

  private parseLoreResponse(text: string): LoreData {
    try {
      let cleaned = this.cleanJSONResponse(text);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("[Parse Error] Failed to parse lore response:", error);
      throw new Error("Invalid JSON response from AI");
    }
  }

  private cleanJSONResponse(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }
}
