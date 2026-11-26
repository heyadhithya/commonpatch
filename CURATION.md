# How Commonpatch selects issues

Commonpatch is a starting point for contributors who want to work on public-interest software. Each project has a public repository and a contributor guide. Its category describes the project’s purpose. The language shown is GitHub’s primary language for the repository. A translation, dataset or documentation issue may require a different skill.

## The dated board

The initial selection contains 27 issues in 11 repositories across mapping, climate, accessibility, open knowledge and civic technology. Its retrieval time is stored in [board.json](public/data/board.json). We queried the GitHub API through Composio and checked the following before including each entry.

- The repository was public, unarchived and had received a push in the previous six months. The linked contributor guide existed on its default branch.
- The record was an open, unlocked issue with zero assigned users. Its labels explicitly invited contributions. For example, CKAN uses `Good for Contribution` and `Beginner Friendly`. Projects can have different expectations for the same label.
- The issue had been updated within the previous six months. A recent update can be a label or metadata edit on an older proposal. The original creation date is retained.
- We reviewed recent discussion for signs of someone already working on the task and checked GitHub’s linked closing pull requests. We excluded obvious active claims, known fixes and linked implementations from the dated selection. GitHub did not expose every informal claim or unlinked branch.

Issue titles, labels, comment counts and dates come from GitHub. Descriptions in the dated board are short plain-text excerpts of issue bodies. Some excerpts omit template instructions, attribution headers or URLs. The original conversation is one click away.

The live feed can include a wider set of qualifying issues than the hand-reviewed selection. Check recent comments, related pull requests and the project’s instructions before starting. “Help wanted” can describe advanced work. Commonpatch recommends no completion time and makes no assignment on a maintainer’s behalf.

## Suggest a project

Open a pull request editing [the project registry](public/data/projects.json). Include the canonical `owner/repo`, a short factual description, the matching category, GitHub’s primary language, the public repository URL and its contributor-guide URL. Add `opportunityLabels` only for explicit project-specific invitations to contribute. Include a representative issue link and explain the public benefit in the pull request description.

To update the dated board, verify every retained issue against its source, keep original issue IDs and dates, and set `asOf` to the actual verification time in UTC. Remove closed, assigned or locked records. Keep the maintainer’s labels and show when data was last checked.
