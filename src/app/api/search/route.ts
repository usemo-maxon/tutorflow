import { z } from "zod";
import {
  EMPTY_GLOBAL_SEARCH_RESPONSE,
  GLOBAL_SEARCH_MAX_QUERY_LENGTH,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  normalizeGlobalSearch,
} from "@/lib/global-search";
import { currentTeacherId } from "@/server/auth";
import { ApiFailure, errorResponse } from "@/server/errors";
import { searchGlobal } from "@/server/global-search";

export const runtime = "nodejs";

const SearchQuerySchema = z.string().max(GLOBAL_SEARCH_MAX_QUERY_LENGTH);

function searchResponse(data: unknown) {
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const teacherId = await currentTeacherId();
    if (!teacherId) {
      throw new ApiFailure(401, {
        code: "UNAUTHENTICATED",
        message: "Sesja wygasła. Zaloguj się ponownie.",
      });
    }
    const rawQuery = new URL(request.url).searchParams.get("q") ?? "";
    const parsed = SearchQuerySchema.safeParse(rawQuery.trim());
    if (!parsed.success) {
      throw new ApiFailure(422, {
        code: "INVALID_SEARCH_QUERY",
        message: "Wyszukiwana fraza jest zbyt długa.",
      });
    }
    const query = normalizeGlobalSearch(parsed.data);
    if (query.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
      return searchResponse(EMPTY_GLOBAL_SEARCH_RESPONSE);
    }
    return searchResponse(await searchGlobal(teacherId, query));
  } catch (error) {
    return errorResponse(error);
  }
}
