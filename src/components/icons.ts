import {
  Sparkles, MessageSquare, Columns, Image, Video, Presentation, FileText, Paperclip, Globe, Mic, GraduationCap, Pencil,
  CircleHelp, Target, FilePen, Languages, ClipboardList, CircleCheck, MessageCircle, Users, Lightbulb, BookOpen, Brain,
  School, Calculator, FlaskConical, type LucideIcon,
} from 'lucide-react';

/** Icon names stored in the database (feature_flags.icon, modes.icon) → components. */
const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles, 'message-square': MessageSquare, columns: Columns, image: Image, video: Video, presentation: Presentation,
  'file-text': FileText, paperclip: Paperclip, globe: Globe, mic: Mic, 'graduation-cap': GraduationCap, pencil: Pencil,
  'help-circle': CircleHelp, target: Target, 'file-edit': FilePen, languages: Languages, 'clipboard-list': ClipboardList,
  'check-circle': CircleCheck, 'message-circle': MessageCircle, users: Users, lightbulb: Lightbulb, 'book-open': BookOpen,
  brain: Brain, school: School, calculator: Calculator, flask: FlaskConical,
};
export const ICON_NAMES = Object.keys(MAP);
export const iconFor = (name: string): LucideIcon => MAP[name] ?? Sparkles;

/** Where each feature lives in the user's app. Composer-level / in-chat features have no page. */
export const FEATURE_HREF: Record<string, string | null> = {
  text_chat: '/chat', compare_models: null, image_generation: '/tools/image_generation',
  video_generation: '/tools/video_generation', presentations: '/tools/presentations', teacher_tests: '/tools/teacher_tests',
  file_upload: null, web_search: null, voice_input: null, quiz: null, suggestions: null,
};
