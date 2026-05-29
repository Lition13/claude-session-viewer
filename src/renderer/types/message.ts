export interface ToolResult {
  content: string
  is_error?: boolean
  stdout?: string
  stderr?: string
  /** Rich structured result object (toolUseResult) for tools like Agent / SendMessage / Task* */
  structured?: unknown
}

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  result?: ToolResult
}

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    media_type?: string
    data?: string   // base64 data
    url?: string    // file path or URL
  }
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ImageBlock

export interface ParsedMessage {
  id: string
  role: 'user' | 'assistant'
  timestamp: string
  content: ContentBlock[]
  model?: string
  tokenUsage?: {
    inputTokens?: number
    outputTokens?: number
    cacheRead?: number
    cacheCreation?: number
  }
}
