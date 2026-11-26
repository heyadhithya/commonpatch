# Product and interaction brief

## Design prompt

Build a contribution desk for a student who cares about a public cause but has never made an open-source contribution. Let them find a real issue, understand the project, check whether work is already underway, and prepare a thoughtful first message. Help a club organizer share a shortlist without exposing anyone’s notes. Preserve the source and freshness of every claim about issue status.

## Primary tasks

| Person | Task | Observable completion |
| --- | --- | --- |
| First-time contributor | Find one opportunity in a cause they care about | Opens the original issue and contributor guide from a filtered result |
| Returning contributor | Pick up a previous planning session | Can recover their saved issue, checklist, and private note after reloading |
| Volunteer organizer | Prepare a small contribution session | Can share public issue references and export a dated agenda without collecting participant accounts |

## Interaction decisions

- The board’s default sort rotates through causes. A popular repository cannot occupy every initial result.
- Search, cause, language, and label filters combine. Their values are reflected in the URL so a useful search can be bookmarked.
- The board distinguishes live GitHub results, a bounded or partial index, a cached response, and a dated fallback. Detail pages recheck the selected issue when possible.
- Long descriptions stay behind a disclosure. The discussion and available linked work help a reader decide whether to proceed before investing time.
- A workbench makes personal progress visible. Private drafts are separate from the public shortlist URL and from comments copied for GitHub.
- Native form controls and dialogs provide familiar keyboard operation, focus handling and mobile behavior. Cause, status, and action labels accompany color and icon cues.

## Portfolio fit

Adithya’s portfolio documents civic technology, community service and student projects. CommonPatch gives other students and volunteer organizers a way to participate in existing public-interest projects. It does not represent the maintainers or promise that a contribution will be accepted. [Adithya’s portfolio](https://adhithya.com/)

## What to test with people

Ask five first-time contributors to select a cause, find one suitable issue and explain how they checked for existing work. Record task completion, confusing labels and the source they trusted. Then ask a club organizer to share a shortlist and open the calendar handout. Record whether their private notes stayed private and whether the export made the session easier to run. These are proposed usability tests. No interviews or adoption figures are claimed.
