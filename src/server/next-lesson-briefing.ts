import "server-only";

import {
  composeNextLessonBriefing,
  type NextLessonBriefing,
} from "@/lib/next-lesson-briefing";
import { getLessonWorkspace } from "./lesson-workspace";
import { getStudentMemory } from "./student-memory";

export async function getNextLessonBriefing(
  teacherId: string,
  lessonId: string,
  generatedAt = new Date().toISOString(),
): Promise<NextLessonBriefing> {
  // Workspace lookup is the ownership boundary and supplies the immutable
  // participant snapshot from lesson_participants.
  const workspace = await getLessonWorkspace(teacherId, lessonId);
  const memories = await Promise.all(
    workspace.participants.map((participant) =>
      getStudentMemory(teacherId, participant.studentId, generatedAt),
    ),
  );
  return composeNextLessonBriefing(workspace, memories, generatedAt);
}
