# Tickets

The Telegram bot's export, deduplicated and given a **Done when** so an audit has
something to check against. This file is *what was asked for*; `KNOWN_ISSUES.md`
is *what we decided*. Where they touch, this links there rather than restating.

## How to read a ticket

- **Source** — the meeting report it came from (R-0008, R-0009, R-0012, R-0013)
  and the date it was reported. This is the provenance: it is how you trace a
  ticket back to the conversation that produced it.
- **Observed** — the reporter's own words, in Spanish, followed by a translation.
  Kept close to the original rather than paraphrased, because the detail in the
  original is the evidence.
- **Done when** — the condition that closes it, tagged with where it came from:
  - `STATED` — the reporter said what done looks like.
  - `DERIVED` — **inferred by Claude from the description.** This is an
    assumption, not the reporter's requirement, and may be wrong.
  - `UNDERIVABLE` — the ticket was never specific enough. Not guessed at.
- **Status** — one of `Open`, `Fixed <sha>`, `Accepted — <reason>`,
  `Superseded by <ID>`.

## About the source export

The export was duplicated: every block appears about twice, and F-0017's text
three times. Deduplicated here. Where wordings differed the fullest was kept and
the variant noted on the ticket.

**F-0018 does not appear anywhere in the export.** Not in a report, not in a
ticket list, not in a "de aquí salen" line. It is recorded here as absent rather
than left as a gap in the numbering — whether it was withdrawn, never filed, or
lost in the export is not answerable from what was sent.

**R-0014 onwards are assigned here, not by the export.** R-0008 to R-0013 came from the
Telegram export this file was built from. Reports after it have no number of their own —
the bot records a meeting, not a report id — so they are numbered here as they are used
and mapped to the row they came from, which is what makes the provenance checkable:

| report | meeting | in the database |
|---|---|---|
| R-0014 | 2026-09-13 · «Revisión de usabilidad, errores de interfaz y métricas» | `equipo.reuniones` id 16 |

This is the repo's own numbering being continued, not a bot id being guessed at — rule 8
forbids the second, not the first.

**R-0000 means the ticket came from no meeting report.** F-0018 carries it because it
appears in no report at all; F-0043a and F-0043b carry it because they were reported
straight through the bot rather than in a meeting, and their provenance is the
`equipo.fallas` row itself. A meeting is not invented to give a ticket a number.

`D-1` to `D-9` are **not defect reports**. They are the decisions taken at the end
of R-0009 and R-0013, given ticket form so they can be tracked and closed. Their
`Done when` comes from the decision itself. The mapping of a D-number to a
specific decision line is reconstructed from how the numbers were used in the
work, and is marked where it is an inference.

---

## F-0006 — Listening and tap-to-speak buttons overlap the answer controls
**Source** R-0008 · reported 2026-09-07
**Severity** 🟡 Molesta
**Area** Interfaz de examen
**Observed** *Los botones de listening y tap to speak se superponen con los botones de hablar, escribir y press enter.*
> The listening and tap-to-speak buttons overlap the speak, write and press-enter buttons.
**Expected** One set of answer controls visible at a time.
**Done when** `DERIVED` Only one set of answer controls is present for a given step; the listening and speaking controls do not occupy the same space.
**Status** Fixed — covered by `test/exam-durability.test.js` ("one set of answer controls at a time (F-0006)")

## F-0007 — Unnecessary hyphens in the exam texts
**Source** R-0008 · reported 2026-09-07
**Severity** 🔵 Menor
**Area** Textos del examen
**Observed** *Presencia de guiones innecesarios en los textos del examen que deben ser eliminados.*
> Unnecessary hyphens are present in the exam texts and should be removed.
**Expected** The reporter states the fix: remove them.
**Done when** `STATED` No stray hyphens remain in the exam item texts.
**Status** Open — never addressed. The reporter did not say which texts or which hyphens, and the item bank is large; identifying them needs the reporter or a pass through the bank.

## F-0008 — Downloading the report shows an error
**Source** R-0008 · reported 2026-09-07
**Severity** 🛑 Bloquea
**Area** Reportes
**Observed** *Al hacer clic en descargar y obtener el reporte, se muestra un mensaje de error indicando que algo salió mal.*
> Clicking download to get the report shows an error message saying something went wrong.
**Expected** The report downloads, or the failure is reported somewhere the team can see.
**Done when** `DERIVED` The report download path cannot fail silently: every failure is caught and written to ClientEvents through `_reportClientError`.
**Status** Fixed `e10f9c6`

## F-0009 — Reloading after the report error signs the user out and destroys the attempt
**Source** R-0008 · reported 2026-09-07
**Severity** 🛑 Bloquea
**Area** Persistencia y Autenticación
**Observed** *Al recargar la aplicación tras el error de reporte, el sistema desloguea al usuario y elimina por completo el intento de examen realizado.*
> Reloading the app after the report error signs the user out and completely deletes the exam attempt.
**Expected** A reload keeps the session, and a finished sitting survives it.
**Done when** `DERIVED` A reload restores the session from storage, and a completed sitting is written to the sheet before the report is attempted, so it survives a failure of the report step.
**Status** Fixed — session persistence covered by `test/session-persistence.test.js`; the sitting is written by `apiSaveIcaoTranscript` before grading, covered by `test/exam-durability.test.js`

## I-0027 — Improve the progress tab design
**Source** R-0008 · reported 2026-09-07
**Area** Simulador
**Observed** *Se requiere optimizar la interfaz de usuario (front) en la pestaña de progreso (progress tab).*
> The front-end of the progress tab needs improving.
**Expected** Not stated. "Optimizar" names no condition that can be checked.
**Done when** `DERIVED` The progress tab uses the design system rather than ad-hoc styling: tokens for colour, the shared type scale, and no hardcoded hex.
**Status** Fixed — the progress surfaces were brought onto the token system; covered by `test/design-system.test.js` and `test/typography.test.js`. **The derived criterion is narrower than the request** — it makes the tab consistent, which is not the same as making it good.

## F-0010 — Not all emoji were changed
**Source** R-0009 · reported 2026-09-07
**Severity** 🔵 Menor
**Area** emojis
**Observed** *No todos los emojis se modificaron.*
> Not all the emoji were changed.
**Expected** The emoji that should be icons are icons.
**Done when** `DERIVED` Every emoji on a rendered client surface is either a drawn `uiIcon` or documented as one of the categories where an emoji is the correct choice.
**Status** Accepted — sweep complete, 31 marks remain with reasons. See KNOWN_ISSUES, "the emoji sweep is complete; 31 marks remain on purpose"

## F-0011 — Retry sits too far down in pilot read-back
**Source** R-0009 · reported 2026-09-07
**Severity** 🟡 Molesta
**Area** pilot read back
**Observed** *El botón 'retry' queda demasiado abajo en la sección de 'pilot read back' (después de 'speak' y 'send'), obligando al usuario a hacer scroll.*
> The retry button sits too far down in the pilot read-back section (after speak and send), forcing the user to scroll.
**Expected** Retry is reachable without scrolling.
**Done when** `DERIVED` Retry is reachable without scrolling, and using it does not replay the clearance for free — the behaviour behind the complaint.
**Status** Fixed `6519a07` — **the fix addressed the second half.** The reported symptom was placement; investigation found Retry was also replaying the clearance at no cost beside a Replay that charged a listen. Whether the button position was also moved is not verifiable from the repo (rendered geometry, rule 6).

## F-0012 — Feedback gives no confirmation that it was sent
**Source** R-0009 · reported 2026-09-07
**Severity** 🔵 Menor
**Area** feedback
**Observed** *En algunas fases de vuelo, al dar feedback no aparece confirmación de si este se envió o no.*
> In some flight phases, giving feedback shows no confirmation of whether it was sent.
**Expected** Feedback confirms it was sent.
**Done when** `DERIVED` The feedback widget is offered on every phase, pass or fail, and confirms submission.
**Status** Fixed `5cb215c` — the widget was `ok ? widget : ""`, so feedback was collected only after a success. Covered by `test/feedbackCard.test.js`.

## F-0013 — Write read-back: the cursor does not land in the field
**Source** R-0009 · reported 2026-09-07
**Severity** 🛑 Bloquea
**Area** write readback
**Observed** *Al solicitar el 'write readback', el simulador no permite escribir porque el cursor no se posiciona donde corresponde.*
> When write read-back is requested, the simulator will not let you type because the cursor is not positioned where it should be.
**Expected** Requesting a written read-back puts the cursor in the input.
**Done when** `DERIVED` Requesting a written read-back focuses the input, and only a deliberate press spends a replay.
**Status** Fixed — covered by `test/replay-gate.test.js` ("F-0013 · only a press spends a replay")

## F-0014 — Audio replay consumes an attempt without the user asking
**Source** R-0009 · reported 2026-09-07
**Severity** 🟡 Molesta
**Area** audio replay
**Observed** *La reproducción de audio ('replay') consume automáticamente un intento del ejercicio sin que el usuario lo haya activado.*
> Audio playback (replay) automatically consumes an attempt without the user having triggered it.
**Expected** Only a replay the user asked for costs an attempt.
**Done when** `DERIVED` Autoplay is free — the clearance arriving is the exercise starting — and only a press of Replay spends a listen.
**Status** Fixed — covered by `test/replay-gate.test.js`. The counters this governs are documented in KNOWN_ISSUES, "three replay counters, now named and deliberately unequal".

## F-0015 — The text does not unlock after the four audios play
**Source** R-0009 · reported 2026-09-07
**Severity** 🛑 Bloquea
**Area** simulador
**Observed** *El texto no se desbloquea una vez que se reproducen los 4 audios.*
> The text does not unlock once the 4 audios have been played.
**Expected** Playing the required audios unlocks the text.
**Done when** `DERIVED` The client and the server gate on the same replay threshold, so the count that unlocks the text is the count the server recorded.
**Status** Fixed — the cause was seven independent `|| 2` defaults across client and server, named in `cbb378b` and now compared by `test/threshold-parity.test.js`. See KNOWN_ISSUES, "T-5 / T-6".

## F-0016 — Flags show as text abbreviations instead of images
**Source** R-0009 · reported 2026-09-07
**Severity** 🟡 Molesta
**Area** banderas
**Observed** *Las banderas no se despliegan correctamente, mostrando solo abreviaturas de texto (como IN, GB) en lugar de la imagen correspondiente.*
> The flags do not display correctly, showing only text abbreviations (such as IN, GB) instead of the corresponding image.
**Expected** A flag renders as a flag.
**Done when** `DERIVED` Every country flag renders as inline SVG through one function, on every platform, with no image fetch and no regional-indicator pair.
**Status** Fixed — inline SVG flags, plus `bbac96b` which found eleven more built from regional-indicator pairs that bypassed the function. Covered by `test/sitting-report.test.js`.

## I-0028 — Change the green used for a perfect score
**Source** R-0009 · reported 2026-09-07
**Area** Simulador
**Observed** *Cambiar el tono de verde del score 100/100 para que no se confunda con el verde de 'clot' y se alinee con la paleta de colores del proyecto.*
> Change the green of the 100/100 score so it is not confused with the 'clot' green and aligns with the project palette.
**Expected** The reporter states both the change and the reason.
**Done when** `STATED` The score green is a palette token, distinct from the brand green it was being confused with.
**Status** Fixed — `--green` deepened to `#2ea55c` in the dark theme. The light theme keeps `#166534` because `ConfigService.js` pins the email palette to it.

## I-0029 — Consider adding an instruction for flight phases involving altitude
**Source** R-0009 · reported 2026-09-07
**Area** Simulador
**Observed** *Evaluar la viabilidad de incluir una instrucción para las fases de vuelo que contienen altitud.*
> Evaluate the feasibility of including an instruction for the flight phases that involve altitude.
**Expected** The ticket asks for an assessment, not a change.
**Done when** `DERIVED` A feasibility assessment exists and is recorded — including the decision not to do it, if that is the answer.
**Status** Open — no assessment has been made. This needs a product decision, not code.

## F-0017a — Section 3 audio appears as text, unauthorised
**Source** R-0013 · reported 2026-09-08
**Severity** 🛑 Bloquea (assigned)
**Area** Mock test
**Observed** *Al tomar el mock test en Mac el día 7 de septiembre se detectó que los audios de la tercera sección salen en forma de texto sin autorización. Esta sección es solamente para evaluar listening comprehension.*
> Taking the mock test on a Mac on 7 September, the third section's audio was found to come out as text without authorisation. That section is only for assessing listening comprehension.
**Expected** The candidate never receives the transcript; the examiner does.
**Done when** `DERIVED` No client-reachable endpoint returns a transcript field, and an audio turn is graded against a transcript injected server-side.
**Status** Fixed `866f702`
**Notes** **The bot has this as a single ticket, F-0017, covering two distinct defects.** Split here as F-0017a and F-0017b so each can be tracked and closed separately; the bot ID for both is F-0017.

## F-0017b — Pronunciation and structure appear as two rubrics instead of one
**Source** R-0013 · reported 2026-09-08
**Severity** 🛑 Bloquea (assigned)
**Area** Mock test
**Observed** *El examen se tomó intencionalmente en español y se halló que la rúbrica de pronunciación y de estructura salen dos cuando todo debería aparecer en uno. Revisar las rúbricas.*
> The exam was taken deliberately in Spanish and the pronunciation and structure rubrics came out as two when it should all appear as one. Review the rubrics.
**Expected** Not clear from the text. "todo debería aparecer en uno" could mean the two descriptors should be merged into one rubric, or that one report should not render two rubric blocks.
**Done when** `UNDERIVABLE`
**Status** Open — needs the reporter. **Two readings, opposite work:** merging pronunciation and structure would change the ICAO descriptor set, which has six named descriptors and is not ours to alter; rendering one block instead of two is a display fix. Guessing between them risks changing how candidates are graded.
**Notes** **Same bot ID as F-0017a.** The export contains this sentence twice with a wording variant — "la rúbrica ... salen dos" and "salen en dos". Neither reading resolves the ambiguity above.

## F-0019 — Bugs in the mock test
**Source** R-0012 · reported 2026-09-08
**Severity** 🟡 Molesta
**Area** mock test
**Observed** *Bugs en el mock test*
> Bugs in the mock test.
**Done when** `UNDERIVABLE`
**Status** Open — **not specific enough to verify, and not guessed at.** R-0012 records that the team agreed new findings would be reported in Telegram "en formato de instrucciones"; the detail this ticket points at was meant to arrive separately and did not.

## F-0020 — Bugs in the report that stop it generating correctly
**Source** R-0012 · reported 2026-09-08
**Severity** 🟡 Molesta
**Area** reportes
**Observed** *Bugs en el reporte que impiden que se genere correctamente*
> Bugs in the report that prevent it from generating correctly.
**Done when** `UNDERIVABLE`
**Status** Open — **not specific enough to verify.** It names a symptom class, not a case. F-0008 (the report download error, same surface) is fixed; whether that is what this refers to cannot be established from the text.

## I-0032 — Improve the simulator loading time
**Source** R-0012 · reported 2026-09-08
**Area** Simulador
**Observed** *Optimizar el tiempo de carga del simulador para mejorar la experiencia de usuario.*
> Optimise the simulator loading time to improve the user experience.
**Expected** A goal, with no threshold given.
**Done when** `DERIVED` The paper fetch and the first recording start before Begin is pressed rather than after the reservation returns, so the two round trips overlap instead of running in series.
**Status** Fixed `7f04e8e`, extended in `1a212b4`. **No number was set and none is claimed:** click-to-first-item cannot be measured from the repo (rule 6). What is verified is structural.

## I-0033 — Test the new-student flow with an unregistered email
**Source** R-0012 · reported 2026-09-08
**Area** General
**Observed** *Utilizar un correo no registrado previamente para evaluar el flujo de registro y bienvenida de un estudiante nuevo.*
> Use a previously unregistered email address to evaluate the sign-up and welcome flow for a new student.
**Expected** The reporter states the action to take.
**Done when** `STATED` The sign-up and welcome flow has been walked end to end with an address that has never been used, and what happened is recorded.
**Status** Open — **this is a task for a person, not code.** It needs a real browser and a real inbox, neither of which is verifiable from the repo.

## F-0021 — Students can see annotated transcripts and correction detail
**Source** R-0013 · reported 2026-09-08
**Severity** 🛑 Bloquea
**Area** Servidor · Resultados de estudiante
**Observed** *El estudiante puede ver las transcripciones anotadas, respuestas correctas y detalles de corrección de los exámenes*
> The student can see the annotated transcripts, correct answers and correction details of the exams.
**Expected** A student cannot reach the examiner's working, at the server, not by hiding it.
**Done when** `DERIVED` The `[ADMIN_REPORT]` instruction is refused server-side for any role that is not ADMIN or INSTRUCTOR, and `admin_view` is not returned to the browser at all.
**Status** Fixed `68763db` — verified by execution in audit #2: the client control is gated to ADMIN/INSTRUCTOR and fails closed, the pipeline returns `student_view` only, and the conversational path nulls `admin_view`.

## F-0022 — The admin report is directly accessible to student accounts
**Source** R-0013 · reported 2026-09-08
**Severity** 🛑 Bloquea
**Area** Servidor · Reporte de administrador
**Observed** *El reporte de administrador es visible y accesible de forma directa por usuarios con rol de estudiante*
> The administrator report is visible and directly accessible to users with the student role.
**Expected** R-0013 decided the mechanism: a server-side 403, not a hidden link.
**Done when** `STATED` A student requesting the admin report receives a server refusal, and the report is not in the response the browser receives.
**Status** Fixed `68763db` — the same commit that closed F-0021. **Audit #2 could not confirm this** because no commit names F-0022; with the ticket text now available it is verifiable and it holds.

## F-0023 — Grey and struck-through text on the free results screen fails contrast
**Source** R-0013 · reported 2026-09-08
**Severity** 🟡 Molesta
**Area** Pantalla de resultados
**Observed** *Los textos en gris o tachados en la pantalla de resultados del plan gratuito tienen un contraste inferior al mínimo*
> The grey or struck-through texts on the free plan results screen have contrast below the minimum.
**Expected** The locked results screen meets the contrast minimum.
**Done when** `DERIVED` No text on the locked results screen falls below the contrast floor, and the locked state is not conveyed by colour alone.
**Status** Fixed — covered by `test/results-contrast.test.js`

## F-0024 — The mock test is slow to load on mobile Safari with new accounts
**Source** R-0013 · reported 2026-09-08
**Severity** 🟡 Molesta
**Area** Mock test
**Observed** *Demora al cargar el mock test en Safari móvil con cuentas nuevas*
> Delay loading the mock test on mobile Safari with new accounts.
**Expected** The exam starts without a wait the candidate notices.
**Done when** `DERIVED` The paper and the first recording are fetched during the gap between picking a paper and pressing Begin, and the transcript lookup is warmed then too rather than landing on the first Part 2 item.
**Status** Fixed `7f04e8e` and `1a212b4`. **Measured where it could be:** the transcript lookup was 3892 ms cold and moves off the exam path. Start-up wall clock needs a browser and a student session (rule 6).

## F-0025 — "Completa el nivel anterior" appears in Spanish in an English interface
**Source** R-0013 · reported 2026-09-08
**Severity** 🔵 Menor
**Area** Simulador
**Observed** *El texto explicativo Completa el nivel anterior aparece en español dentro de una interfaz configurada en inglés*
> The explanatory text "Completa el nivel anterior" appears in Spanish inside an interface configured in English.
**Expected** The string is in English, like the rest of the interface.
**Done when** `DERIVED` No Spanish string appears on an English interface surface.
**Status** Accepted — the string is fixed; an i18n layer is declined. See KNOWN_ISSUES, "F-0025 — internationalisation: not needed". Covered by `test/english-only.test.js`.

## F-0026 — The disabled submit button is nearly invisible
**Source** R-0013 · reported 2026-09-08
**Severity** 🔵 Menor
**Area** Simulador
**Observed** *El botón de envío deshabilitado es casi invisible debido a la falta de contraste*
> The disabled submit button is almost invisible due to lack of contrast.
**Expected** A disabled button is legible as a disabled button.
**Done when** `DERIVED` The disabled button state uses palette tokens rather than reduced opacity, so it stays legible.
**Status** Fixed — `.btn:disabled` uses `var(--panel)`, `var(--line)` and `var(--muted)` with no opacity reduction.

---

# Decisions

`D-1` to `D-9` are **not defect reports.** They are the decisions recorded at the
end of R-0009 and R-0013, given ticket form so they can be tracked and closed
like anything else. A decision's `Done when` comes from the decision itself, so
all nine are `STATED` — what is inferred is only which decision line each
D-number refers to, reconstructed from how the numbers were used in the work.
Where that mapping is an inference it says so.

R-0013 recorded seven decisions and R-0009 one. One R-0013 decision — the
server-side 403 for the admin report — is tracked on F-0022 rather than as a
D-number, because it is the fix for a filed defect rather than a change of
direction.

---

## D-1 — ICAO descriptors are hidden and not sent by API on the free plan
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Ocultar y no enviar por API los descriptores OACI en el plan gratuito*
> Hide the ICAO descriptors and do not send them by API on the free plan.
**Done when** `STATED` A free caller's response does not contain the six descriptor scores — they are withheld before the response is written, not hidden in the browser.
**Status** Fixed `fd4e5fb`, `d6baa57`
**Notes** The decision says "no enviar por API", which is why a client-side redaction was not acceptable — it was removed. See KNOWN_ISSUES, "the throw branch shipped all six descriptors", for a leak found in the same function.

## D-2 — Rename the Mock Test for legal reasons
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Renombrar el Mock Test a examen de práctica o simulacro por razones legales*
> Rename the Mock Test to practice exam or simulacro for legal reasons.
**Done when** `STATED` No user-facing surface calls it a "mock test"; every one names it as an ICAO-based practice test.
**Status** Fixed `9d43253`, `eea6552`
**Notes** `ICAO Test` survives as an internal navigation key, compared in code to decide which screen is active. It is not user-facing.

## D-3 — Exam tabs become a non-interactive progress indicator
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Convertir las pestañas de navegación del examen en un indicador de progreso no interactivo*
> Turn the exam navigation tabs into a non-interactive progress indicator.
**Done when** `STATED` The part rail cannot be clicked to move between sections; it only reports where the candidate is.
**Status** Fixed — nothing was needed
**Notes** Verified four times across three sessions: the rail is `span` elements with no `onclick`, no cursor, no `pointer-events` and no `:hover`. It was already non-interactive when the decision was taken.

## D-4 — Add a permanent progress panel to the exam
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Añadir un panel de progreso permanente y estados visuales dinámicos como vúmetro y temporizador circular durante el examen*
> Add a permanent progress panel and dynamic visual states such as a VU meter and a circular timer during the exam.
**Done when** `STATED` The exam header shows which item the candidate is on, out of how many, for the whole sitting.
**Status** Fixed `b21eade`
**Notes** This decision line covers three separate changes — the panel, the VU meter and the circular timer — tracked as D-4, D-7 and D-6. **That split is an inference** from how the numbers were used. The panel counts *answerable* items: a paper is 35 steps and 16 of them are the examiner speaking, so counting steps would have overstated the work by nearly double.

## D-5 — Locked cards go from red to grey with a padlock
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Cambiar el estado visual de las tarjetas bloqueadas en el simulador de rojo a gris con candado*
> Change the visual state of locked cards in the simulator from red to grey with a padlock.
**Done when** `STATED` A locked level reads as unavailable, not as an error.
**Status** Fixed
**Notes** `.status.BLOCKED` uses `var(--muted)` on a lift background. Red is reserved for failure; being locked is not a failure.

## D-6 — A circular countdown timer during the exam
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Añadir ... estados visuales dinámicos como vúmetro y temporizador circular durante el examen*
> Add dynamic visual states such as a VU meter and a circular timer during the exam.
**Done when** `STATED` The answer countdown is shown as a ring as well as a number.
**Status** Fixed `b21eade`
**Notes** The ring surrounds the digits rather than replacing them: answer windows are 60–120 seconds, so the ring moves about three degrees a second — good for "roughly how much is left", useless for "can I finish this sentence", which is the decision that actually matters in the last few seconds. **Same decision line as D-4 and D-7.**

## D-7 — A live VU meter while recording
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Añadir ... estados visuales dinámicos como vúmetro ... durante el examen*
> Add dynamic visual states such as a VU meter during the exam.
**Done when** `STATED` The candidate can see that their voice is being picked up while they speak.
**Status** Fixed
**Notes** **Same decision line as D-4 and D-6, and this mapping is the least certain of the three** — D-7 was recorded as implemented before this export existed, and "vúmetro" is the only remaining item on that line. If D-7 was meant to be something else, this entry is wrong and the ticket text would settle it.

## D-8 — Remove emoji from the demo path
**Source** R-0013 · decided 2026-09-08 · **origin: a decision, not a defect report**
**Decided** *Eliminar los emojis de las superficies del recorrido de la demo*
> Remove the emoji from the surfaces of the demo walkthrough.
**Done when** `STATED` No emoji remains on a surface the demo walkthrough passes through, unless an emoji is the correct choice there and the reason is recorded.
**Status** Accepted — see KNOWN_ISSUES, "the emoji sweep is complete; 31 marks remain on purpose"
**Notes** The decision names the demo path specifically. The sweep went wider than that; the remainder is documented category by category.

## D-9 — Unify replay with retry
**Source** R-0009 · decided 2026-09-07 · **origin: a decision, not a defect report**
**Decided** *Unificar el replay con el retry*
> Unify replay with retry.
**Done when** `STATED` A candidate cannot hear the clearance again without it costing what a replay costs.
**Status** Accepted — not unified, and the reasoning is recorded. See KNOWN_ISSUES, "D-9 — replay and retry stay two controls, deliberately"
**Notes** **Closed against the letter of the decision.** The two controls do different things a student needs separately — Retry gives back the answer, Replay gives back the recording — and merging them would charge a listen to fix a typo. The bypass that made them incoherent was closed instead: Retry no longer replays the clearance for free.

---

## F-0018 — absent from the export

**Source** R-0000 · not present in any report
**Observed** *(no text — the id does not appear in the export)*
> Nothing. F-0018 appears in no ticket, no report and no "de aquí salen" line.
**Done when** `UNDERIVABLE`
**Status** Accepted — recorded as a known absence rather than a gap in the numbering

F-0018 appears nowhere in the Telegram export: not as a ticket, not in a report,
not in any "📌 De aquí salen" line. The numbering runs F-0017 → F-0019 with
nothing between them.

Whether it was withdrawn, merged into another ticket, never filed, or lost in the
export is not answerable from what was sent. It is recorded here so the gap in
the sequence is a known absence rather than something an auditor has to
rediscover.

---

## F-0028 — The challenge confirmation says "null" instead of the pilot's name
**Source** R-0014 · reported 2026-09-13 by Angélica Álvarez
**Severity** 🟠 Molesta
**Area** Crew — challenges
**Observed** *El mensaje de confirmación al proponer un reto muestra 'Challenge sent to
null' en lugar del nombre del destinatario.*
> Proposing a challenge confirms with "Challenge sent to null" instead of the
> recipient's name.
**Expected** The confirmation names the pilot the challenge went to.
**Done when** `DERIVED` The toast reads the pilot's display name, falling back to their
email — which is what the code already tried to do, and what the modal title on the line
above it does. If the email or the scenario was wanted instead, this is the wrong fix.
**Status** Fixed `4aeffaa` — **though not by the code that commit wrote**, and that is
the part worth knowing. `_gamSendChallenge` called `_gamCloseModal()`, which sets
`_gam.targetName` and `_gam.targetEmail` to null, and built the toast out of those two
fields three lines later; the fix read the name into a local above the close. One hour
later `9188e10` replaced that whole flow with the five-question duel and **deleted both
the function and its test**:

    $ git log --diff-filter=AD --name-status -- test/challenge-toast.test.js
    9188e10  D  test/challenge-toast.test.js
    4aeffaa  A  test/challenge-toast.test.js
    $ grep -c "_gamSendChallenge" Scripts.html
    0

So this file claimed coverage from a file that has not existed since 15 September.

**What satisfies the Done when today is the panel, not a toast.** `_gamOpenModal` reads
`data-name` into a local and `_duelLoading` writes "Challenging ‹name›" into
`gamDuelTitle`, which stays on screen through the confirmation — so the confirmation does
name the pilot, with the email as the fallback, on a different surface from the one the
ticket described. Confirmed live on 2026-09-18 from a screenshot of a real duel:
"CHALLENGING JUAN CAMILO MARTINEZ CORREA" above "Challenge sent · You scored 5 of 5".

**Now guarded again.** `test/challenge-duel.test.js` inherited this subject when it
replaced the deleted suite, and said so in its header while asserting nothing about the
name — the behaviour rested on `_duelResult` leaving the title alone, which nothing
required. Three assertions there now do.

**The fallback is what proves it was ordering and not missing data.** With `data-name`
absent the toast would have shown the email; with `data-email` absent the guard at the
top of the send would have refused to send at all. Reaching the toast *and* printing the
word `null` needs both fields cleared between the send and the message, and only the
close does that. Two screenshots confirmed it: the pilot's name renders correctly in the
card while the toast says `null`.

**A second implementation exists and was left alone.** `Gamification.js:407` already
returns `'Challenge sent to ' + targetEmail + ' on scenario "…"'`, and the client
discards it on the success path — it only reads `res.message` when the send fails. Using
it would have fixed this too, but it changes what the message says (email instead of
name, plus the scenario), and that is scope this ticket did not ask for. Recorded here
rather than fixed.

---

## F-0043a — Nothing happens between the Duel button and the first question

**Source** R-0000 · no meeting report — reported straight through the bot on
2026-09-17 by Juan David Ladino (`equipo.fallas` F-0043, `origen` botones).
**Severity** 🟠 Molesta
**Area** Crew — challenges
**Observed** *adicionalmente seria importante poner algun front o algun sonido que
conecte desde que se le da click al duel hasta que carga el quiz ya que se demora 1,2
segundo que quizas el usuario no entienda que debe esperar.*
> Something visual or audible is needed between clicking Duel and the quiz loading —
> it takes a second or two and the user may not understand that they should wait.

**Expected** The tap is answered at once, even though the paper is not ready yet.

**Done when** `STATED` Pressing Duel produces something on screen and something
audible before the first question appears.

**Status** Fixed `6b01f47`. The overlay now opens on the tap with the boot screen's
globe turning inside the card and a radio squelch, and the first question replaces the
globe when the paper arrives. Covered by `test/duel-globe-parity.test.js`, which guards
the second copy of the geometry against drifting from the original rather than the
behaviour itself.

**Checklist** — walk it in the app, not in the code.

- [ ] Pressing Duel opens the panel immediately, with the globe turning inside it
- [ ] A squelch is heard on the press, once
- [ ] The panel names the pilot while it waits — "Challenging ‹name›"
- [ ] The first question replaces the globe, and the card does not jump in height
- [ ] On a phone the globe does not overflow the card and the page does not scroll sideways
- [ ] Cancel closes the panel, and a paper that arrives afterwards does not reopen it
- [ ] If the connection drops, the panel closes and says why
- [ ] The loading screen at app start is unchanged

**Notes** **Same bot ID as F-0043b.** One report carried two asks — this one and the
email — so they are split here the way F-0017 was, and the bot ID for both is F-0043.

The globe is a **second copy** of the one in `LoadingScreen.html`, chosen deliberately
over parameterising the original: that screen had shipped three days earlier and every
session starts with it. The geometry is not re-derived, though — the region between the
`AERO-GEO-SHARED` markers is lifted verbatim and the parity test compares the two with
comments and whitespace stripped.

---

## F-0043b — The challenged pilot is not emailed

**Source** R-0000 · no meeting report — reported straight through the bot on
2026-09-17 by Juan David Ladino (`equipo.fallas` F-0043, `origen` botones).
**Severity** 🟠 Molesta
**Area** Crew — challenges · `_gamMailChallenge_`
**Observed** *En los retos, el correo al retado no esta llegando, en la base de datos
"challenge" si esta siendo registrado pero no llega al correo.*
> The email to the challenged pilot is not arriving. The row is recorded in the
> Challenges sheet, but no email comes.

**Expected** When somebody is challenged, they are told by email.

**Done when** `STATED` The challenged pilot receives the notification when the
challenger finishes their run — confirmed by a real duel, not by reading the code — and
when it cannot be sent, the reason is recorded and the challenger is told it did not go.

**Status** Open — **instrumented, cause not established.** The send is no longer
silent: it returns an outcome, the reason reaches `ClientEvents` through
`_reportClientError` and `ErrorLogs` through `LogService.error`, the challenger sees a
line saying the opponent was not emailed, and `ScriptApp.getService().getUrl()` — the
one call in the function that can throw — is guarded with `appBaseUrl_()` behind it.

**2026-09-18, after the `clasp push`: the email arrived.** And it settled less than it
looks like it did, so both halves are written down.

What it settled: **the button linked to the wrong place.** Accept Challenge was built
from `ScriptApp.getService().getUrl()`, which is Apps Script's `/exec` — whatever `clasp`
last pushed, served by HtmlService — and not the app Vercel builds from source. The same
message already carried the right origin three lines above, in the logo, because
`getLogoUrl()` goes through `appBaseUrl_()`. Fixed: the button asks `appBaseUrl_()` and
nothing else. Verified live — `aerocomms.vercel.app` answers 200 and so does
`/brand/logo.d1689057.png`, while `v1-verscel.vercel.app` 307s to it.

What it did **not** settle: **why the mail was not arriving before.** The arrival proves
`getService().getUrl()` never threw — it returned the `/exec` URL, which is how the wrong
link got into the message — so the guard was not the repair. Nothing else in that commit
can make MailApp deliver: hoisting a call that does not throw is a no-op, and the `!to`
early return refuses to send rather than sending. **The change did not fix the
delivery.**

**And there is a second reason the arrival proves nothing about the code: it may not
have been running.** Production calls the deployment pinned in `api/gas.mjs`, which was
on version `@667`; `clasp push` updates the project and `@HEAD` but leaves a pinned
deployment serving what it already served. So unless that deployment was repointed, the
instrumentation was never live — which also means a failure today would still record
nothing.

**The link is the canary.** Both the old code and yesterday's produced an `/exec` link,
so nothing observable distinguished them. This commit's does not: if the next challenge
email's button points at `aerocomms.vercel.app`, the new backend is live and the deploy
path works. If it still points at `script.google.com`, the deploy is what needs fixing,
not the mail.

**The leading explanation is now the daily MailApp quota**, and it is the only one that
accounts for every piece of evidence at once: it is shared across every send in the
project, which is why the duel mail and the squadron invitation failed together while
login codes kept working; it needs no code to change; and it resets every 24 hours,
which is why today it works. Spam filtering is still alive as a second explanation and
is cheap to check — the older messages would be sitting in a folder.

**One line settles it**, in the Apps Script editor:

    Logger.log(MailApp.getRemainingDailyQuota());

A number near 1,500 means Workspace with room to spare and the quota theory is dead. A
small one, or zero, means it was the cause and the fix is not code.

**What was eliminated, and how.** Each of these was read, not pattern-matched.
KNOWN_ISSUES retracted a list of swallowed failures because it
was "produced by a pattern match" rather than by reading them, and this is not a
revival of that list: this catch was read, and the reporter's own evidence says
the path was taken — the row was written and the screen said Challenge sent.


| candidate | why it is not the cause |
|---|---|
| a missing plain-text `body` | the login-code email omits it too, and that one arrives |
| `_emailWrap_` or the `EC_` palette | the login-code email uses both |
| `EC_.amber` / `EC_.ink` undefined | both keys exist in `EMAIL_PALETTE_`; a missing key is an empty string, not a throw |
| `getLogoUrl()` throwing | every I/O inside it is wrapped and falls back to a literal |
| the wrong row reader — `dbReadAll_` lowercases keys and would leave `Target_Email` undefined | `_gamFindChallenge_` uses `_gamReadAll_`, which keys by the sheet's own headers |
| `_gamSS_()` failing | the Challenges row is written through it, which is the reporter's own evidence |

**What is left.** `ScriptApp.getService().getUrl()` throwing (guarded now, and the
strongest candidate until the squadron invitation turned out to fail too, which that
call cannot explain), the day's `MailApp` quota, an address the platform refuses, or a
message accepted and filtered as spam. The quota is read either side of the send
precisely because it tells those apart: it drops if MailApp accepted the message.

**The duel is not lost when the mail is not sent.** By the time the send is attempted
the row has been patched to `Awaiting_Target`, so the challenge is in the target's Crew
tab either way. The email is a courtesy; the defect was that its failure was invisible.

**Checklist**

- [x] A real duel: the challenged pilot receives "‹name› has challenged you!" — 2026-09-18
- [ ] The link in that email opens the app served by Vercel, not Apps Script's `/exec`
      — first attempt opened `/exec`; fixed, needs a second `clasp push` to confirm
- [ ] With the send broken on purpose, the challenger sees the line saying the opponent
      was not emailed
- [ ] And the reason is readable afterwards in `ClientEvents`, without opening an execution
- [ ] A duel the target submits does not claim a notification was owed — no line either way

**Notes** **Same bot ID as F-0043a.** The squadron invitation in `sendRequest` has the
same swallowing shape and is reported to be failing as well; it is recorded below rather
than fixed here, because it is a different function and this ticket did not ask for it.

---

## Simulator read-back card — layout restructure

**No bot ID.** QA-originated, delivered as three mockups plus a screenshot of the
current build on 2026-09-09. Rule 8 forbids inferring one. When QA supplies the
ID, rename this heading to `## <ID> — Simulator read-back card — layout
restructure` and `test/tickets-ledger.test.js` will begin enforcing its shape;
until then it is counted as prose and its fields are not checked.

**Source** QA mockups · reported 2026-09-09
**Severity** Medium — usability, no data or grading effect
**Area** `renderScenarioStageImmersive`, Scripts.html:8728 · the
`sim-readback-priority-card` article

**Observed** Four controls at three different widths stacked down the card: Speak
and Send share a row, Send is half-width, Retry is small and left-aligned below
them, and the feedback panel appears only after an evaluation, so everything
under it moves when results arrive.

**Expected** The vertical order in the mockups: ATC header, replay dots + hint
inline, transmission panel, read-back label + hint, textarea, one full-width
primary action whose label follows state, an action row of "Practice again" left
and status text right, and a feedback panel that is always present.

**Done when** `STATED` The read-back card follows the mockup's vertical order on
every level and every flight phase, Send is gone, and every Retry reads "Practice
again".

**Status** Fixed — built 2026-09-09 after the three blocking questions were
answered by the reporter. Items 1-5 of the target order already matched; only the
action, the row and the feedback panel changed.

**Notes**

*Single renderer confirmed.* `renderScenarioStageImmersive` (Scripts.html:8728)
is the only builder of this card, called from three places. The practice test
builds its own card around `#icaoReadback` (Scripts.html:11227). **But both
textareas carry the class `sim-readback-priority-input`**, styled at eight places
in Styles.html — so markup changes are safely scoped to the simulator and
class-level CSS changes are not.

*Enter is already bound and already submits.* `_commsKeyHandler`
(Scripts.html:9163), capture phase on `document`: `if (e.key === 'Enter' &&
!e.shiftKey)` → `_simSubmitReadback()`. Its comment records that this is
deliberate in every phase. The typed path in the ticket needs no work.

*Send has three callers, not one.* The button (8827), `_simSubmitReadback`
(9133), and `_simOnTranscript` (9141), plus a `window.` export at 15135 with no
external caller found. Deleting the button is safe; deleting
`immersiveSendReadback` is not — it is the submission entry point for the
keyboard path too, and must survive as a function.

**The three answers, as given.** (1) Keep review-then-Enter: stopping the
recorder does not submit. (2) Build a logical advance control from the layout —
resolved as one right-hand slot holding a status while work is happening and the
advance button once there is somewhere to go, since the two are sequential and
cannot co-occur. (3) "Recording…" during and "Transcribing…" after, replacing
"Live transcription…", which would have described something the product does not
do.

*Blocking question 1 — auto-submit on stop contradicts a deliberate decision.*
`_simOnTranscript` submits only when Enter asked for it, and its comment states
why: "tapping the mic to stop should still leave the transcript on screen to be
read and edited." Whisper systematically mishears aviation terms — `_BASE_FIXES`
is a forty-entry repair table that exists for exactly that reason and is
known-incomplete. Auto-submitting on stop removes the student's only chance to
correct a misheard transcript before it is graded on keywords.

*Blocking question 2 — the target action row has nowhere for "Next exercise".*
The verdict renderer (Scripts.html:10928) puts Practice again beside either
"Next exercise" / "Finish route and view debrief", or a disabled "Saving…" while
the server has not yet confirmed. The ticket's status set is "Live
transcription…", "Evaluating…", "Saving…" and no others. If "Saving…" becomes
status text and nothing replaces the primary button, route progression has no
control.

*Blocking question 3 — "Live transcription…" would not be true.* The string does
not exist in the codebase and neither does any level meter. Transcription here is
batch: record, stop, POST to `/api/whisper`, receive a transcript. Nothing is
transcribed while the student is speaking, which is the state the mockup shows
that label in.

*Not in scope, and confirmed distinct.* Only one "Retry" in this card
(Scripts.html:10928). The other 30+ in Scripts.html belong to the home reconnect,
the exams, the TEA examiner and the test-result screens.

---

## Admin and Analytics navigation bypasses the sitting guard

**No bot ID.** Found 2026-09-10 while building the sitting guard.

**Source** Found during other work · reported 2026-09-10
**Severity** Low — staff-only surface
**Area** `Index.html:136-137`, the top navigation

**Observed** Every student-facing nav button calls `_navTo(fn)`, which now asks
before abandoning a live examination. The Admin and Analytics buttons call
`renderAdminNav()` and `renderAdminAnalytics()` directly, so they skip it.

**Expected** Either they route through `_navTo` like the rest, or they carry the
guard themselves.

**Done when** `DERIVED` Both buttons ask before abandoning a live sitting, and
`test/sitting-guard.test.js` no longer needs to whitelist them.

**Status** Open — deliberately out of scope of the guard commit. Changing markup
outside the exam flow is a drive-by under rule 4, and an admin sitting the exam is
a rare case. The suite pins the count at exactly two so a third cannot appear
unnoticed.

---

## A simulator route in progress has no guard either

**No bot ID.** Found 2026-09-10 while building the sitting guard.

**Source** Found during other work · reported 2026-09-10
**Severity** Medium — student-facing, same shape as the exam defect
**Area** `renderScenarioStageImmersive`, the simulator route flow

**Observed** The exam now asks before a sitting is abandoned. A simulator route in
progress does not. It is less costly than losing an exam — phases are recorded as
they are completed rather than all at the end — but a student mid-route still
loses the current phase and the run's continuity with no warning.

**Expected** A decision about whether the same question is owed, and the same
answer applied everywhere it is.

**Done when** `UNDERIVABLE`

**Status** Open — needs a product decision before code. The simulator uses
`enableSimulatorFocusMode`, so its exposure is smaller than the exam's was; whether
that is small enough to leave alone is not a question the repository can answer.

---

## A sitting cannot survive a crash, only a mis-tap

**No bot ID.** Found 2026-09-10 while building the sitting guard.

**Source** Found during other work · reported 2026-09-10
**Severity** Medium
**Area** `_t` in the TEA module

**Observed** `_t` is a plain in-memory object. There is no draft, no server-side
partial and no resume. The guard shipped alongside this ticket stops accidental
navigation, but a dead battery, a crashed tab or a page evicted by the browser
still costs the candidate the whole examination.

**Expected** A sitting interrupted by something other than a deliberate exit can be
resumed, or at minimum its completed answers survive to be graded.

**Done when** `DERIVED` A sitting interrupted by a page reload can be resumed or
submitted from what was already answered.

**Status** Open — and it is not small. `_t.history` is text and would fit anywhere,
but `_t.segments` holds roughly two dozen base64 recordings, well past
localStorage's limit, so durable storage means IndexedDB. Persisting the history
alone is worse than useless: without the audio the pipeline cannot grade, and the
sitting would fall to the text-only grader, which is the path that produced every
straight-1 result on record.

**Notes** The guard is the seatbelt. This is the airbag, and it is the one that
matters when the failure is not the student's doing.

---

## The fallback grader takes over without telling anyone

**No bot ID.** Found 2026-09-10 while diagnosing the pipeline 413.

**Source** Found during other work · reported 2026-09-10
**Severity** High — it is the reason two separate grading defects ran undetected
**Area** `_finishExam` in Scripts.html, the `else` branch after `/api/tea-pipeline`

**Observed** When the pipeline does not return a usable result the client calls
`_unlockExamUI()` and `_teaRequestFinalReport()` and says nothing. No client error
is reported, no message reaches the student, and nothing distinguishes the two
graders on screen. The only trace is the `Source` column in the results sheet,
which nobody reads until something looks wrong.

**Expected** A grader substitution is reported through `_reportClientError` /
`apiLogClientEvent`, the way every other client failure is.

**Done when** `DERIVED` A pipeline failure is recorded server-side with its reason,
so the substitution is visible without reading the results sheet.

**Status** Open. This is CLAUDE.md's "errors must be observable" rule, on the path
where it cost the most: a 413 that ran for weeks and a dropped-argument bug that
ran longer, both invisible because the app quietly did something else instead.

**Notes** Worth doing regardless of whether the pipeline itself is healthy — it is
the difference between finding the next one in a log and finding it in a
spreadsheet.

---

## FLAG_SVG ids collide when more than one flag is drawn

**No bot ID.** Found 2026-09-10 while removing the brand images from the bundle.

**Source** Found during other work · reported 2026-09-10
**Severity** Medium — affects live screens, not only the map that surfaced it
**Area** `FLAG_SVG` in Scripts.html, and the 20 call sites of `getFlagHtml`

**Observed** The inlined flags carry short ids and reference them internally:

    us  defines a b c d e   references a b c d e
    gb  defines a b         references a b
    au  defines a b c d     references a b c d

Two flags in the same document share that namespace, and `#a` resolves against
the **first** in document order. `Scripts.html` 13414-13417 draws four flags in a
row in the subscription modal, and 6243/6286 draw them in a loop.

**Expected** Each insertion namespaces its own ids so a flag keeps its own
references regardless of what else is on the page.

**Done when** `DERIVED` Two different flags rendered into one document each keep
their own gradients, clips and masks, asserted by a test that renders two and
checks the second's references still resolve to its own definitions.

**Status** Open. Not fixed alongside the brand-image work because it touches
`getFlagHtml`, which 20 call sites use, and the screens affected are not the one
that surfaced it.

---

## Two reward emails embed an image mail clients discard

**No bot ID.** Found 2026-09-10 while removing the brand images from the bundle.

**Source** Found during other work · reported 2026-09-10
**Severity** Low — cosmetic, in two emails
**Area** `Gamification.js` 213 and 383

**Observed** Both put the logo directly into a `MailApp.sendEmail` `htmlBody` as
an `<img src>` rather than using `inlineImages` with a Blob, the way the other
seven email paths do. Gmail and most clients discard `data:` images outright, so
those two logos have probably not rendered for some time.

**Expected** The same `inlineImages` treatment as the other seven, or the image
dropped from those templates deliberately.

**Done when** `DERIVED` Both use `inlineImages` with a Blob, or the image is
removed from those two templates by decision.

**Status** Open. They were renamed to `getLogoUrl()` when the base64 getter was
removed — enough that they do not call a deleted function, and no worse than
before, since a remote URL is at least not stripped outright. The defect is
unchanged.

---

## Progress shows every student a PILOT rank label

**No bot ID.** Found 2026-09-10 while reading the tier definitions.

**Source** Found during other work · reported 2026-09-10
**Severity** Medium — student-facing, and wrong for three of four professions
**Area** `_PROG_TIERS` (Scripts.html:20340) and `PROFESSION_TIERS` (24725)

**Observed** `_PROG_TIERS` hard-codes `'Junior Captain'` and its siblings — the
PILOT labels — while `PROFESSION_TIERS` exists and carries all four professions.
A CONTROLLER sees "Junior Captain" on the Progress screen.

**Expected** The rank label on Progress comes from the student's own profession,
as it does everywhere else.

**Done when** `DERIVED` A student whose profession is not PILOT sees their own
profession's rank label on Progress.

**Status** Open.

---

## The app's base URL is computed five different ways

**No bot ID.** Found 2026-09-10 while adding the fifth.

**Source** Found during other work · reported 2026-09-10
**Severity** Medium — some emails link students to /exec and others to the domain
**Area** Userservice.js 237, 456, 561 · TourService.js 664, 743 · EnvService.js 92
· Gamification.js 398 · ConfigService.js `appBaseUrl_()`

**Observed** Four of them call `ScriptApp.getService().getUrl()`, which returns
the Apps Script `/exec` URL. Two read an `APP_URL` Script Property with different
fallback chains. The fifth, added with the brand-image work, follows the fullest
of those chains because it needs the Vercel domain — Apps Script does not serve
`/brand/logo.png`.

The consequence is already live: a student's emails link to two different places
depending on which template sent them.

**Done when** `DERIVED` One function answers "where is the app", every caller uses
it, and a test counts the callers so a sixth cannot appear quietly.

**Status** Open — one caller fewer since 2026-09-18, and the consequence is no longer a
prediction. The challenge email's Accept button was opening `/exec`; it now asks
`appBaseUrl_()`, and `test/challenge-notify.test.js` holds it there, including an
assertion that no origin is written out inside that function so a sixth answer cannot
appear where the fifth was found.

Two corrections to the list above, both found while doing it. **`Gamification.js 398` no
longer exists** — the duel rewrite moved that code, and the only `getService()` call left
in the file was the mail's, now gone, so the file has none. And the behaviour change this
ticket was deferred over **has now happened for one template**: challenge emails send
students to the Vercel domain from today. That is the argument for finishing it rather
than against, because the remaining templates now disagree with this one as well as with
each other.

Still open for Userservice 237, 456, 561, TourService 664, 743 and EnvService 92.

---

## The catalog requires the checkpoint exam; the attempt validator does not

**No bot ID.** Found 2026-09-10 while consolidating the tier partition.

**Source** Found during other work · reported 2026-09-10
**Severity** Medium — two server gates disagree about the same rule
**Area** `buildTrainingCatalogV5Hard_` in Código.js · `ProgressService.canUserAccessLevel`
in Attemptservice.js

**Observed** The catalog gates levels 4, 7 and 10 on the preceding exam:
`levelItem.unlocked = examPassed`, from `getExamPassedMap_`. So the client is not
offered a level whose checkpoint has not been passed.

`canUserAccessLevel`, which guards `validateScenarioAccess_` on attempt
submission, checks only that every previous level is complete. It never looks at
an exam.

**Expected** One answer to "may this user enter this level", used by both.

**Done when** `DERIVED` A request to submit an attempt for a level whose checkpoint
has not been passed is refused server-side, and a test proves it by executing the
validator rather than reading the catalog.

**Status** Open. Not fixed alongside the partition work, which was a consolidation
and touched no gating. Related to the entitlement gap already filed against
`canUserAccessLevel`: the same function is missing both checks.

**Notes** This is the two-gates shape rather than the fix-by-hiding one — the
catalog is a real server-side decision, not a UI trick. But a rule enforced in one
of two places is a rule that depends on which door someone knocks at.


---

## The squadron invitation swallows its failure the same way

**No bot ID.** Found 2026-09-18 while instrumenting F-0043b. Reported by Juan David
Ladino in the same conversation: the "Squadron invitation from ‹name›" emails are not
arriving either.

**Source** Found during other work · 2026-09-18
**Severity** Medium — a pilot invites somebody who is never told
**Area** `sendRequest` in Gamification.js, the `catch (mailErr)` at 285

**Observed** The invitation is sent inside a `try` whose `catch` body is a comment and
nothing else, so a throw leaves no error, no log and no line anywhere. It is the same
shape F-0043b had, in a different function, and the reporter says it fails too.

**Expected** The same treatment F-0043b got: an outcome rather than a swallow, the
reason recorded, and the sender told when the invitation did not go out.

**Done when** `DERIVED` A failed invitation is visible to the pilot who sent it and
readable afterwards without opening an execution.

**Status** Open. Not fixed alongside F-0043b: rule 1 is one ticket, one commit, and this
is a different function with no ID of its own. **That both fail is the useful part** —
it rules out `ScriptApp.getService().getUrl()`, which only the duel mail calls, and
points at something the two share or at `MailApp` itself.

---

## LogService.info is called and does not exist

**No bot ID.** Found 2026-09-18 while looking for somewhere to record a mail failure.

**Source** Found during other work · 2026-09-18
**Severity** Medium — a diagnostic that has never recorded anything
**Area** `LogService.js` 50

**Observed** `apiLogGraderDisagreement` calls `LogService.info('graderDisagreement', …)`.
`LogService` defines `admin` and `error`. There is no `info`, in that object or anywhere
else in the project:

    $ grep -rn "LogService\.info\|info: *function" --include=*.js . | grep -v node_modules
    LogService.js:50:    LogService.info('graderDisagreement', JSON.stringify({

So every call throws a TypeError, and the function's own `catch` returns `{ ok: false }`
with the comment *"A diagnostic must never be the thing that breaks an exercise"* —
which is right, and is also why nobody noticed. `checkGraderAgreement()` reads the rows
this was supposed to write and reports "No disagreements recorded. Either the two graders
agree, or nobody has trained since this shipped." Neither is true: nothing was ever
written.

**Expected** Either `LogService.info` exists, or the caller uses `LogService.error` with
a level, and `checkGraderAgreement` can distinguish "no disagreements" from "no data".

**Done when** `DERIVED` One grader disagreement, deliberately provoked, appears in
`ErrorLogs`, and `checkGraderAgreement()` reports it.

**Status** Open. It is the same shape as F-0043b — a silent diagnostic — and it was found
the same afternoon, which is the argument for fixing the class rather than the instance.

**Notes** This is a read call site, not a pattern match: the method is absent from the
object literal three lines above the call.

---

## The duel result panel keeps the last question's countdown

**No bot ID.** Seen 2026-09-18 in a screenshot the reporter sent to confirm F-0028.

**Source** Found during other work · 2026-09-18
**Severity** Low — cosmetic, on a screen every duel ends on
**Area** `_duelResult` / `_duelStartCountdown` in Scripts.html

**Observed** The result panel — "Challenge sent · You scored 5 of 5" — still shows the
clock reading `26s` and the countdown bar most of the way full, left over from the last
question. `_duelResult` replaces the body but not the header, and `_duelClearTimer` stops
the interval without clearing what it painted.

**Expected** Nothing is counting down on a screen where nothing is being timed.

**Done when** `DERIVED` The result panel shows no clock and no countdown bar.

**Status** Open. Not fixed in F-0043a's commit: rule 4, and it is a different surface
from the one that ticket is about.

---

## Cancel on the loading globe can leave a paper nobody will ever play

**No bot ID.** Found 2026-09-18, as a consequence of F-0043a's own change.

**Source** Found during other work · 2026-09-18
**Severity** Low — a row per cancelled launch, invisible to everyone
**Area** `createChallenge` in Gamification.js, `_gamOpenModal` in Scripts.html

**Observed** `createChallenge` writes the row and draws the paper before the challenger
plays, with `Status = Awaiting_Challenger`. `getIncomingChallenges` lists only
`Awaiting_Target`, so until the challenger finishes their five the row is invisible to
the target and no mail has been sent — by design, since the mail carries the
challenger's score.

A challenger who does not finish therefore leaves a drawn paper that nobody will see or
play. That was always reachable by closing the tab mid-duel; F-0043a's Cancel button
makes it a deliberate one-tap action, which is why it is being written down now rather
than left as a thing the code happens to do.

**Expected** Either a cancelled launch does not leave a row, or the rows it leaves are
visible to somebody — a sweep, an expiry, or the target seeing "‹name› has a duel
waiting to be played".

**Done when** `DERIVED` A launch that is cancelled before any answer is submitted leaves
nothing behind that a pilot can neither see nor play.

**Status** Open. Not fixed in F-0043a: the button was asked for, and the choice between
not writing the row, expiring it, or showing it is a product decision this ticket did not
carry. The paper has to be drawn before the challenger plays — both pilots answer the
same frozen five — so "do not write the row yet" is not free either.

**Notes** Cancel was added because the overlay is modal: without it, a call that never
answers traps the pilot behind a turning globe. The trade was taken knowingly — a
reachable escape against a row that was already reachable another way.
