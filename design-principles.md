ONGOING

## 0.1 Multi-projectional nature

Lain is inherently a multi-projectional programming language. This intention is anchored by the idea that, through the evolution of amnesis technology, media has always evolved toward the simultaneous—a simulacrum of the multi-layered nature of the human mind.

### 0.1.1 Art of memory

This idea is further revealed by the art of memory, or loci, or memory palace: a technology that can be read as utilizing the full potential of the mind by evoking multi-layered sensory information.

**References**
- Yates, Frances A. *The Art of Memory*. Routledge & Kegan Paul, 1966. (History of mnemonic systems from Simonides of Ceos through the Renaissance; standard modern treatment.)
- Classical sources: *Rhetorica ad Herennium* (c. 80 BCE), Cicero *De Oratore* (55 BCE), Quintilian *Institutio Oratoria* (c. 95 CE)—method of loci as a tool for ordering and recalling speech and ideas via imagined places and images.
- O’Keefe & Nadel, in work on the hippocampus and cognitive maps, describe the method of loci as “an imaginal technique known to the ancient Greeks and Romans and described by Yates (1966) in her book *The Art of Memory*” (see e.g. *The Hippocampus as a Cognitive Map*, 1978).

---

## 0.2 Design of the user environment

The user environment of Lain is not a separate construct like an IDE. The environment itself is designed to be a fully reflective, multi-directional projection of the underlying semantics—a hyper-object that supports the user in over-viewing or under-viewing different levels of detail according to immediate requirements.

> Hyperobjects are "viscous, molten, nonlocal, phased, and interobjective—they are impossible to understand from a single point of view."
> — Timothy Morton, *Hyperobjects: Philosophy and Ecology after the End of the World* (2013), from the object-oriented ontology (OOO) tradition.

### 0.2.1 Architectural constraints

The following constraints anchor the architecture of this environment.

**ARCHITECTURE**

The architecture of the environment knows nothing of the specific syntax design of the language (as that design is still under constant evolution). It communicates with the compiler through RPC and cares only about what data needs to be visualized and how to visualize it.

**SYNTAX**

Some basic examples:

- `(text (cell 'a))`
- `(plotting (cell 'a))`
- `(layer network-A network-B network-C)`
- `(text-field (cell 'a))`

**COMPOSITION OF SYNTAX**

Visualizations can be composed:

- `(VStack (text (cell 'a)) (layer network-A network-B))`

Modifiers can be applied to the visualization function itself:

- `((scale 3 text) (cell 'a))`

**CONTEXTUAL SENSING**

Every visualization card can sense its neighboring environment, specifically: `::above`, `::below`, `::left`, `::right`.

This allows the user to compose means of visualization in real time. For example:

```
(+ a b c)
(graph ::above ::below)

[        graph        ]
```

Visualization is by default below (following conventions), but can be re-directed through explicit annotation or dynamically moved to empty space when the environment detects that the designated display space is blocked.

`::above` and `::below` are semantically cells.

**LAYOUT**

The visualization environment is by default organized through a grid system, which provides a flexible yet clear layout for efficient communication. Layout details (rows, columns) can be configured according to the user’s immediate requirements.

**AMNESIS**

How is information stored? All information is stored in the database. Each grid is a struct that contains its child elements together with positional data.

**LAYERS**

Layers can be transformed into higher dimensions; higher dimensions can also be dissected back into lower dimensions, revealing connections across those lower-dimensional layers for different data types.
