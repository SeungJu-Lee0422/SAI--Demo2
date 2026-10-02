# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-10-03
- Primary product surfaces: Expo web, iOS/Android UI; account service and separate local example experience.
- Evidence reviewed: `mobile/DemoApp.tsx`, `mobile/demo-api.ts`, `shared/demo-types.ts`, `README.md`; current sibling `../SAI/mobile/App.tsx`, `../SAI/mobile/GroupPlanner.tsx`, service API and matching/grouping modules.
- User direction: keep SAI--Demo2 UI/UX and bring in SAI functionality. No separate brand assets or screenshot reference supplied.

## Brand
- Personality: calm, approachable Korean social-interest app.
- Trust signals: source evidence, explicit sharing controls, real solver status, clearly labeled examples.
- Avoid: invented interest evidence, probability claims, mixing example participants into account data.

## Product goals
- Goals: accounts, editable private interests, sources, accepted friends, invite rooms and real CP-SAT assignments in Demo2 screens. Accepted-friend detail includes shared social links and connection removal.
- Non-goals: chat, automatic collection of LinkedIn career data, new dependencies, production deployment.
- Success signals: signup → profile → shared interests → accepted friendship / joined room → comparison → assignment → confirmation survives reload.

## Personas and jobs
- Primary personas: people meeting friends and organizers preparing small tables.
- User jobs: select topics to share, find common ground, invite participants and compare assignments.
- Key contexts of use: personal device; PC recommended for downloading/running browser AI models.

## Information architecture
- Primary navigation: 친구 / 그룹 / 마이.
- Core routes/screens: login/signup, profile setup/edit, friend requests, common topics and evidence, room list/join/detail, participants, conditions, recommendations, table detail, profile sharing, source import, personal AI analysis.
- Content hierarchy: eyebrow → heading → description → section cards → primary action.
- Examples: explicit entry from account landing/My; visibly separate local Demo mode with return action.

## Design principles
- Reuse Demo2 components and tokens. Keep its 600px centered shell, bottom navigation, cards and spacing.
- Privacy decisions are visible beside each interest and each social link.
- Show common topics only with evidence for every selected person; label partial table topics with participant coverage.
- Tradeoffs: SAI's authenticated APIs remain separate from anonymous Demo APIs; reuse presentation without conflating sessions.

## Visual language
- Color: ink #18181B, muted #71717A, line #E9E9EC, surface #F6F6F7, white cards; existing error treatment.
- Typography: Demo2 system typography; 29/39 heading, 14/23 body, 12/19 supporting copy.
- Spacing/layout rhythm: 24px horizontal content, 13–20px card spacing.
- Shape/radius/elevation: 12–19px rounded controls/cards; quiet panels, minimal borders, no new shadows.
- Motion: scroll to top on page transitions; existing progress spinner; cancellable AI work.
- Imagery/iconography: Ionicons, circular user avatars, QR for real share links.

## Components
- Existing components to reuse: DemoApp Button, Avatar, Heading, Card, Section, Tag, Empty, Score, TopicRow, QualityRow, SourceList and styles.
- New/changed components: account screens, profile/privacy editor, invitations, request management, real room planner.
- Variants and states: existing primary/secondary/disabled controls; selected checkbox/radio/tab semantics.
- Token/component ownership: `mobile/DemoApp.tsx`; service composition `mobile/SAIApp.tsx`.

## Accessibility
- Target standard: retain labeled inputs and accessible roles; reasonable touch sizes and readable contrast.
- Keyboard/focus behavior: native Pressable/TextInput interaction and ScrollView; preserve entered data on errors.
- Contrast/readability: existing Demo2 colors; secondary content remains readable.
- Screen-reader semantics: meaningful labels, checked/selected states, alerts and live status messages.
- Reduced motion and sensory considerations: no new animations; nonanimated page scrolling.

## Responsive behavior
- Supported breakpoints/devices: full width through 600px; centered shell above 600px.
- Layout adaptations: wrap tags, avoid fixed widths, scroll long profile forms and evidence.
- Touch/hover differences: all actions support touch; no hover-only information.

## Interaction states
- Loading: boot spinner, disabled duplicate mutations, actual model progress.
- Empty: explain next step for no friends/rooms/shared interests.
- Error: preserve inputs and show dismissible server message; allow retry.
- Success: concise saved/imported notice; refresh authenticated state.
- Disabled: only when required fields/selection/permissions or pending request prevent the action.
- Offline/slow network: expose request failure; cancel browser model work when leaving the page.

## Content voice
- Tone: short, friendly Korean consistent with Demo2.
- Terminology: 관심사, 공유, 친구 요청, 모임, 테이블, 편성.
- Microcopy rules: separate explicit likes/avoid/explore; distinguish manual input and YouTube/LinkedIn sources; score is a reference, not relationship probability.

## Implementation constraints
- Framework/styling system: existing React Native / Expo / StyleSheet.
- Design-token constraints: reuse Demo2 exports, no new design framework.
- Performance constraints: existing browser Web Workers; disclose initial model download and PC recommendation.
- Compatibility constraints: bearer service sessions use existing `sai-session` storage; Demo cookie remains independent/local-only.
- Test/screenshot expectations: TypeScript, export build, service and Demo smokes, isolated browser flow and mobile/desktop screenshots where available.

## Open questions
- [ ] Real Google OAuth credentials/account validation require user-owned setup; preserve clear setup errors.
- [ ] Physical iOS/Android validation and public deployment are outside this local integration.
