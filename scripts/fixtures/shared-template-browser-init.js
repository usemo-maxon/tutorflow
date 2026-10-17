(() => {
  const template = {
    id: "11000000-0000-4000-8000-000000000001",
    title: "Rozmowa o podróżach — B1",
    description: "Kompletny plan rozmowy oparty na prawdziwej strukturze.",
    subject: "Język angielski",
    level: "B1",
    objective: "Uczeń swobodnie opowie o podróży i dopyta rozmówcę.",
    estimatedDurationMinutes: 60,
    sourceKind: "official",
    authorName: "Easy4Tutor",
    sourceAttribution: "Oficjalny szablon Easy4Tutor",
    excludedPrivateAttachments: true,
    publishedAt: "2030-01-01T00:00:00.000Z",
    isFeatured: true,
    featuredOrder: 1,
    adoptionCount: 12,
    isFavorite: false,
    sections: Array.from({ length: 8 }, (_, position) => ({
      id: `12000000-0000-4000-8000-00000000000${position}`,
      title: `Etap ${position + 1}`,
      content:
        "Pełna instrukcja dla nauczyciela i ucznia, zachowana z opublikowanego szablonu.",
      estimatedMinutes: 7,
      position,
    })),
  };
  const originalFetch = window.fetch.bind(window);
  let favorite = false;
  const lessonId = "33000000-0000-4000-8000-000000000001";

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), window.location.href);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const favoritePath = new RegExp(
      `^/api/shared-templates/${template.id}/favorite$`,
    );
    const savePath = new RegExp(`^/api/shared-templates/${template.id}/save$`);

    if (url.pathname === "/api/shared-templates" && method === "GET") {
      return new Response(
        JSON.stringify({
          templates: [{ ...template, isFavorite: favorite }],
          subjects: ["Język angielski"],
          levels: ["B1"],
          readOnly: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (favoritePath.test(url.pathname) && method === "PUT") {
      favorite = true;
      return new Response(JSON.stringify({ favorite }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (savePath.test(url.pathname) && method === "POST") {
      return new Response(
        JSON.stringify({
          templateId: "22000000-0000-4000-8000-000000000001",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }
    if (url.pathname === "/api/app" && method === "GET") {
      return new Response(
        JSON.stringify({
          teacher: { timezone: "Europe/Warsaw" },
          students: [
            {
              id: "44000000-0000-4000-8000-000000000001",
              name: "Jan Kowalski",
            },
          ],
          groups: [],
          lessons: [
            {
              id: lessonId,
              startsAt: new Date(Date.now() + 86_400_000).toISOString(),
              status: "scheduled",
              participantIds: ["44000000-0000-4000-8000-000000000001"],
              topic: "Angielski konwersacyjny",
              subject: "Język angielski",
              planObjectives: "Istniejący cel",
              planItems: [],
              generalNotes: "",
              workspaceMaterials: [],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (
      url.pathname === `/api/lessons/${lessonId}/workspace` &&
      method === "POST"
    ) {
      return new Response(JSON.stringify({ applied: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
})();
