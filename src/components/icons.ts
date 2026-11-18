import { Sparkles, MessageSquare, Columns, Image, Video, Presentation, FileText, Paperclip, Globe, Mic, type LucideIcon } from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles, 'message-square': MessageSquare, columns: Columns, image: Image, video: Video,
  presentation: Presentation, 'file-text': FileText, paperclip: Paperclip, globe: Globe, mic: Mic,
};
export const iconFor = (name: string): LucideIcon => MAP[name] ?? Sparkles;

/** Where each feature lives in the user's app. Composer-level features have no page. */
export const FEATURE_HREF: Record<string, string | null> = {
  text_chat: '/chat', compare_models: '/compare', image_generation: '/tools/image_generation',
  video_generation: '/tools/video_generation', presentations: '/tools/presentations', teacher_tests: '/tools/teacher_tests',
  file_upload: null, web_search: null, voice_input: null,
};
