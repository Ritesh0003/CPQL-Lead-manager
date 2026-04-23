import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeCallRecording(audioBase64: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview', // High-capability model for deep strategic analysis
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: mimeType
              }
            },
            {
              text: `Analyze this real estate sales call recording with extreme strategic precision. Extract deep insights and categorize the lead based on their specific requirements. 

Provide a comprehensive response in valid JSON format:
{
  "summary": "A high-quality, professional executive summary of the conversation",
  "transcription": "A clean, verbatim transcript identifying 'Sales Manager' and 'Customer' speakers with timestamps",
  "auditOutcome": "QUALIFIED" | "UNQUALIFIED" | "NEEDS_FOLLOW_UP",
  "qualificationMatrix": {
    "budget": { "value": "e.g. 2.25 Cr", "isMatched": true },
    "location": { "value": "e.g. Kharghar", "isMatched": true },
    "configuration": { "value": "e.g. 2 BHK", "isMatched": true },
    "possession": { "value": "e.g. 2030", "isMatched": true }
  },
  "confidenceScore": 98, // Percentage (0-100)
  "sentiment": {
    "label": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
    "score": 88 // Percentage (0-100)
  },
  "conversionBlockers": ["List of specific customer pain points or objections that might prevent sale"],
  "strategicAdvice": ["List of high-impact strategic steps to close this specific lead"],
  "customerTone": "Eager" | "Skeptical" | "Angry" | "Indifferent" | "Frustrated",
  "priority": "High" | "Medium" | "Low",
  "suggestedScore": 85, // Lead potential score (0-100)
  "keyTakeaways": "Critical strategic insights for the sales manager to win this lead",
  "tags": ["Relevant tags for high-performance filtering"],
  "suggestedTasks": [
    {
      "title": "Specific action to take",
      "description": "Why this action is needed and what to cover",
      "dueInDays": 2, // Number of days from today this task should be completed
      "assignedToType": "sm" // or "partner/vendor"
    }
  ]
}

Ensure the response is strictly valid JSON without any markdown formatting.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing call recording:", error);
    throw error;
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview', // Using high speed Lite model for near-instant transcription
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: mimeType
              }
            },
            {
              text: "Transcribe this audio recording accurately. Identify speakers if possible. Return only the transcript text."
            }
          ]
        }
      ]
    });

    return response.text;
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw error;
  }
}

export async function generatePerformanceInsights(leads: any[], users: any[]) {
  try {
    const sms = users.filter(u => u.role === 'sm');
    const vendors = users.filter(u => ['vendor', 'vendor_manager', 'vendor_editor'].includes(u.role));

    // Aggregate data for Gemini
    const smStats = sms.map(sm => {
      const smLeads = leads.filter(l => l.smId === sm.id || l.smId === sm.uid);
      const converted = smLeads.filter(l => l.status === 'converted').length;
      const lost = smLeads.filter(l => l.status === 'lost').length;
      return {
        name: sm.displayName,
        totalAssigned: smLeads.length,
        converted,
        lost,
        conversionRate: smLeads.length > 0 ? (converted / smLeads.length) * 100 : 0
      };
    });

    const vendorStats = vendors.map(v => {
      const vLeads = leads.filter(l => l.partnerId === v.id || l.partnerId === v.uid);
      const converted = vLeads.filter(l => l.status === 'converted').length;
      const lost = vLeads.filter(l => l.status === 'lost').length;
      return {
        name: v.displayName,
        totalProvided: vLeads.length,
        converted,
        lost,
        conversionRate: vLeads.length > 0 ? (converted / vLeads.length) * 100 : 0
      };
    });

    const prompt = `Analyze the following performance data for Sales Managers (SMs) and Vendors.
    
SM Data:
${JSON.stringify(smStats, null, 2)}

Vendor Data:
${JSON.stringify(vendorStats, null, 2)}

Provide a JSON response with the following structure:
{
  "redFlags": ["List of critical issues, e.g., 'SM John has a 0% conversion rate on 20 leads'"],
  "recommendations": ["Actionable advice to improve servicing and performance"],
  "smInsights": [
    { "name": "SM Name", "insight": "Specific insight for this SM" }
  ],
  "vendorInsights": [
    { "name": "Vendor Name", "insight": "Specific insight for this vendor" }
  ]
}
Ensure the response is valid JSON without markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating performance insights:", error);
    throw error;
  }
}

export async function analyzeCallRecordingUrl(url: string) {
  try {
    // Fetch the audio content from the URL
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
    
    const blob = await response.blob();
    const mimeType = blob.type || 'audio/mp3';
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return analyzeCallRecording(base64, mimeType);
  } catch (error) {
    console.error("Error analyzing call recording URL:", error);
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error("Cannot access the audio URL directly (likely due to CORS). Please download and upload the file instead.");
    }
    throw error;
  }
}

export async function chatWithGemini(messages: { role: string, content: string }[], context: any) {
  try {
    const systemInstruction = `You are an AI Sales Assistant for CPQL Lead Manager. 
Your role is to help Sales Managers (SMs) and Vendors manage their leads effectively.
Current User Context: ${JSON.stringify(context.user)}
${context.selectedLead ? `Currently Viewed Lead (The user is looking at this lead right now, so provide highly specific assistance if they ask about it): ${JSON.stringify(context.selectedLead)}` : ''}
Available Leads Data: ${JSON.stringify(context.leads)}

Guidelines:
1. Provide reminders and follow-up intelligence based on lead status and last updates.
2. Suggest what to talk about with clients based on their pain points and history.
3. Help vendors improve lead quality and SMs improve conversion.
4. Keep responses concise and professional.
5. If asked about a specific lead, use the provided leads data.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { role: 'user', parts: [{ text: systemInstruction }] },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      ]
    });

    return response.text;
  } catch (error) {
    console.error("Error in Gemini chat:", error);
    throw error;
  }
}

export async function suggestFollowUpReminders(lead: any) {
  try {
    const prompt = `Based on the following lead details, suggest 3 automated follow-up reminders/tasks.
    
Lead Details:
- Name: ${lead.customerName}
- Status: ${lead.status}
- Priority: ${lead.priority}
- Last Interaction: ${lead.updatedAt?.toDate ? lead.updatedAt.toDate().toLocaleString() : 'N/A'}
- AI Analysis Summary: ${lead.callAnalysis?.summary || 'N/A'}
- Pain Points: ${JSON.stringify(lead.callAnalysis?.painPoints || [])}
- Status History: ${JSON.stringify((lead.statusHistory || []).map((h: any) => ({ status: h.status, notes: h.notes, date: h.updatedAt })))}
- Partner Feedback: ${JSON.stringify(lead.partnerFeedback || [])}

Provide a JSON response with the following structure:
{
  "suggestions": [
    {
      "title": "Task title",
      "description": "Task description/notes",
      "suggestedDaysFromNow": 3,
      "type": "call" | "email" | "whatsapp" | "meeting"
    }
  ]
}
Ensure the response is strictly valid JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error suggesting follow-up reminders:", error);
    throw error;
  }
}

export async function generateCollectiveCallSummary(leads: any[]) {
  try {
    const leadsWithAnalyses = leads.filter(l => l.callAnalysis);
    if (leadsWithAnalyses.length === 0) return { summary: "No call recordings found to analyze." };

    const dataToSummarize = leadsWithAnalyses.map(l => ({
      summary: l.callAnalysis.summary,
      painPoints: l.callAnalysis.painPoints,
      priority: l.callAnalysis.priority,
      status: l.status
    }));

    const prompt = `Analyze the following summaries and pain points from multiple sales calls. Provide a high-level collective intelligence summary that highlights:
    1. Common customer themes and concerns.
    2. Overall sentiment and readiness across the leads.
    3. Actionable strategic advice for the team.

    Calls Data:
    ${JSON.stringify(dataToSummarize, null, 2)}

    Provide a JSON response with:
    {
      "summary": "The high-level summary paragraph",
      "topPainPoints": ["Point 1", "Point 2"],
      "strategicAdvice": "Strategic advice for the team"
    }
    Ensure the response is strictly valid JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating collective call summary:", error);
    throw error;
  }
}
