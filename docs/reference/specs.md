;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; lain-lang :: Cards Implementation Spec (pseudo Scheme)
;; Status: DRAFT
;; Aligned with: lain-viz design-principles.md
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1. Ontology
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define ontology
  '((runtime-layer   . "Propagator network; values and computation over cells.")
    (structural-layer . "Card topology; identity and adjacency between cards.")
    (layout . "Projection over structure + value annotations. Adjacency is truth; grid coords are not.")))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2. Runtime Card Model
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Each card owns these cells.
(define card-cells '(code ::this ::left ::right ::above ::below))

;; Semantics
(define card-semantics
  '((code . "Plain string; compiler input.")
    (::this . "Primary computed boundary value (hub).")
    (ports . "(::left ::right ::above ::below) membranes for neighbor interaction and structural requests.")))

;; Universal adjacency wiring: ::this is the hub
(define (wiring-rules A dir B)
  (case dir
    ((left)
     `((bi-sync ,(slot A '::right) ,(slot B '::this))
       (bi-sync ,(slot B '::this)  ,(slot A '::left))))
    ((right)
     `((bi-sync ,(slot A '::left)  ,(slot B '::this))
       (bi-sync ,(slot B '::this)  ,(slot A '::right))))
    ((above)
     `((bi-sync ,(slot A '::below) ,(slot B '::this))
       (bi-sync ,(slot B '::this)  ,(slot A '::above))))
    ((below)
     `((bi-sync ,(slot A '::above) ,(slot B '::this))
       (bi-sync ,(slot B '::this)  ,(slot A '::below))))
    (else (error "Unknown direction" dir))))

(define invariant/ports-never-direct
  "Directional ports never sync directly; all boundary sync passes through ::this.")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 3. Structural Values
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Distinct structural value types.
;; code is string, but CardDesc is NOT "any string": it’s tagged structural.
(define (CardDesc code-string) (list 'CardDesc code-string))
(define (CardIdRef card-id)    (list 'CardIdRef card-id))

(define (CardDesc? v) (and (pair? v) (eq? (car v) 'CardDesc)))
(define (CardIdRef? v) (and (pair? v) (eq? (car v) 'CardIdRef)))
(define (CardDesc-payload v) (cadr v))
(define (CardIdRef-id v) (cadr v))

(define invariant/port-type-law
  "Directional ports mutate topology ONLY when value is CardIdRef / CardDesc (or future op). Other values are ordinary data.")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 4. Localized Compilation
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Local environment bindings exposed to incremental compiler.
(define compiler/local-bindings '(::this ::left ::right ::above ::below))

(define compiler/invariant
  "Compiler is unaware of structural layer, spawning, layout. It builds propagators over cells only.")

;; Global env export (filtered): networks defined in a card may enter global env,
;; but never used to infer topology wiring.
(define compiler/global-export-rule
  "Exported networks are callable globally; exports are never used for adjacency inference.")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 5. Structural Layer (Topology Truth)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Structural truth = cards + symmetric directed edges.
;; No absolute grid positions.
;;
;; cards: (card-id . code-string)
;; edges: (edge from dir to) plus symmetry enforced
(define empty-structure
  '((cards . ()) (edges . ())))

(define invariant/edges-symmetric
  "Edges are symmetric: if (A dir B) exists, then (B (inverse dir) A) exists.")

(define (inverse-dir dir)
  (case dir ((left) 'right) ((right) 'left) ((above) 'below) ((below) 'above)
        (else (error "Unknown direction" dir))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 6. CardsDelta + Reducer-Derived Connect/Detach/Spawn
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CardsDelta is slot updates.
;; We maintain prev slot-state and diff directional slots to derive events.

;; Slot state shape (conceptual):
;; slotMap[(card-id, slot)] = lattice-value-with-clock + annotation
;;
;; Here we only care about *structural refs* in directional slots for topology ops.
;;
;; Topology events:
;;   (detach A dir B)
;;   (connect A dir B)
;;   (spawn-request A dir (CardDesc code))
;;   (cancel-spawn A dir)
;;
(define (infer-directional-event prev next)
  (cond
    ((and (eq? prev 'nil) (CardIdRef? next)) 'connect)
    ((and (CardIdRef? prev) (eq? next 'nil)) 'detach)
    ((and (CardIdRef? prev) (CardIdRef? next)) 'detach-then-connect)
    ((and (eq? prev 'nil) (CardDesc? next)) 'spawn-request)
    ((and (CardDesc? prev) (eq? next 'nil)) 'cancel-spawn)
    (else 'no-topology-event)))

(define reducer/ordering-law
  '(detach-phase connect+spawn-phase symmetry-phase))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 7. Symmetry Enforcement
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Symmetry is enforced by a dedicated rule:
;; If A.dir = B, enforce B.(inverse dir) = A.
;; If conflicting, raise contradiction at structural ref slot level (no silent overwrite).
;;
(define (enforce-symmetry slotMap)
  ;; pseudo:
  ;; for each (A dir) where slotMap has CardIdRef(B):
  ;;   ensure slotMap[(B (inverse dir))] is CardIdRef(A) or nil
  ;;   if it is CardIdRef(C != A) => set contradiction on those slots with annotations
  'TODO)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 8. Spawn Semantics (Structural Values Through Ports)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Directional ports watched for CardDesc.
;; If unoccupied => materialize card, add symmetric edge, compile.
;; If occupied => do not mutate edges; set contradiction on boundary and store annotation.

;; Occupancy is derived from structural edges, not from port strongest value.
(define (occupied? structure origin dir)
  ;; returns #t if there exists an edge origin-dir->some-card
  'TODO)

(define (materialize-card! structure code-string)
  ;; allocate new card-id, store (card-id . code-string)
  ;; return new-card-id
  'TODO)

(define (add-edge-symmetric! structure A dir B)
  ;; add (A dir B) and (B (inverse dir) A)
  'TODO)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 9. Lattice + Annotations (Occupied Neighbor Policy)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Lattice:
;; ⊥ = Nothing
;; ordinary values
;; ⊤ = Contradiction
;;
;; strongest selection: vector clock dominance; ⊤ dominates all.
;;
;; On occupied spawn:
;; - lattice channel: port := ⊤
;; - annotation channel: store attempted CardDesc (or hash) + clock, occupant identity, etc.
;;
(define lattice/bottom '⊥)
(define lattice/top    '⊤)

(define (set-port-contradiction! slotMap origin dir attempted occupant clock)
  ;; slotMap[(origin dir)] := ⊤ (with clock)  ;; lattice channel
  ;; slotMap[(origin dir)] annotation += {attempted, occupant, clock} ;; annotation channel
  'TODO)

(define invariant/no-silent-replace
  "Occupied spawn never mutates topology, regardless of vector clock dominance of attempted spawn.")

;; Resolution actions are explicit (user triggered):
;; Replace / Unplug / Cancel / SpawnIntoLayer(future)
(define resolution/actions '(replace unplug cancel spawn-into-layer/future))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 10. Idempotency
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CardDesc equality must be stable.
;; Additionally maintain last-materialized fingerprint (origin, dir) to guard re-triggers.
(define (carddesc-fingerprint carddesc)
  ;; simplest: hash(code-string)
  'TODO)

(define invariant/spawn-idempotent
  "Same (origin, dir, CardDesc payload) materializes at most once per session unless explicitly re-triggered.")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 11. Detach Lifecycle
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Detach removes bi-sync links and updates edges / structural ref slots.
;; Detached card remains in scene unless explicitly deleted.
(define detach/behavior
  "Detach removes wiring + edge; card persists as orphan.")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 12. Visualization / Projection
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Values may carry visualization schema annotations.
;; Cells do not render; view maps tags -> renderers; interaction state stays in UI.
(define viz/rule
  "Value annotations name visualization schema; renderer selection happens in view layer.")

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 13. Core Invariants
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define invariants
  (list
    "Every card has exactly one ::this."
    "Directional edges are symmetric."
    "Runtime wiring reflects structural edges."
    "CardDesc never contains runtime cell identity."
    "Compiler is unaware of structural layer."
    invariant/port-type-law
    invariant/no-silent-replace
    invariant/spawn-idempotent))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 14. Reducer / Driver Sketch (connect_server loop)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define (apply-CardsDelta slotMap delta)
  ;; apply raw slot updates to slotMap
  'TODO)

(define (diff-directional-refs prevSlotMap nextSlotMap)
  ;; return list of events (detach/connect/spawn/cancel)
  'TODO)

(define (process-events! structure slotMap events)
  ;; Phase 1: detaches
  ;; Phase 2: connects + spawn
  ;; Phase 3: symmetry
  'TODO)

(define (bind-context-slots-io! env slotMap structure)
  ;; per card:
  ;; - build/update carried cell map
  ;; - connect ::this -> incremental compiler with localized env
  ;; - apply wiring derived from structure edges
  'TODO)

(define (connect-server-step! env structure slotMap delta)
  (let* ((prev slotMap)
         (next (apply-CardsDelta slotMap delta))
         (events (diff-directional-refs prev next)))
    (process-events! structure next events)
    (bind-context-slots-io! env next structure)
    ;; emit CardUpdate(s) to frontend
    'TODO))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; End of spec
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
