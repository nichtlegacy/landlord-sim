# Related work

Simulators, analysis tools and papers about the property-trading game family.
Descriptions of other projects come from their READMEs and a reading of their
code in September 2026; we did not run most of them, and they may have changed
since. Licences are as reported by the hosting site at that time.

## Simulators and tools

| Project | What it does well | Where Landlord differs |
|---|---|---|
| [gamescomputersplay/monopoly](https://github.com/gamescomputersplay/monopoly) (Python, no licence) | Parametric heuristic bots, trading to complete groups with a capped cash difference, master seed with seeds per game, starting money and properties per player | Full positions (buildings, mortgages, positions, jail, cards), auctions, the 52-space variant |
| [LK/monopoly-simulator](https://github.com/LK/monopoly-simulator) (Python, MIT) | Loads a complete game state from JSON; clean split of state, state changes, decision makers and engine; auctions for scarce houses | Trading bots, house rules, confidence intervals, web UI |
| [GNOME](https://github.com/mayankkejriwal/GNOME) / [GNOME-p3](https://github.com/mayankkejriwal/GNOME-p3) (Python, research, no licence) | Board as a JSON schema, agent interface with pre-roll, post-roll and out-of-turn decisions, trading, a "hypothetical" simulator that continues a copy of the state; basis of several RL papers | Aggregated statistics with intervals, UI, house rules as switches |
| [ItsSebis/monopoly](https://github.com/ItsSebis/monopoly) (Rust/WASM, no licence) | Bot trading and auctions, strategies as data with sweeps and tournaments, rotating seats, property tests against the event log, rule set as TOML | Starts from a mid-game position, 52-space variant, agreements between players |
| [mismaah/monopsony](https://github.com/mismaah/monopsony) (Go/TS) | Pure engine with commands, events and legal-action lists; fuzzing with invariants; validated JSON config including cards | Monte Carlo evaluation of positions |
| [richard-shepherd/monopyly](https://github.com/richard-shepherd/monopyly) (Python, MIT) | Plugin folder for AIs, tournament runner, about 25 callbacks including deals | 52-space variant, statistics per position |
| [ronenkr/Ronopoly](https://github.com/ronenkr/Ronopoly) (PowerShell, GPL-3.0) | Careful edge cases: mortgage interest on transfer, counter-offers in trades | Batch simulation and analysis |
| [isoqovjorabek2/monopoly](https://github.com/isoqovjorabek2/monopoly) "Party Hall" (TS) | Reducer engine, rule presets that show how far they are from the official rules, a deal maker (rent freedom, revenue shares, loans), bots that value trades, UI in three languages | Batch runner and win probabilities |
| [mbroadfo/monopoly-arena](https://github.com/mbroadfo/monopoly-arena) (TS) | Bots as pure functions over eight decision types | Starts from a mid-game position |
| [b2developer/MonopolyNEAT](https://github.com/b2developer/MonopolyNEAT) (C#) | Neuroevolution of players with a knockout tournament | Configurable rules and editions, tests |
| [6c0de/nemesis-monopoly-agent](https://github.com/6c0de/nemesis-monopoly-agent) (Python) | Evaluation with rotating seats and bootstrap confidence intervals | Full rules rather than a simplified model |
| [bytePatrol/MonopolyAIRoyal](https://github.com/bytePatrol/MonopolyAIRoyal) (Swift) | Live win probability from 10,000 rollouts of a snapshot | Full rules, house rules, uncertain inputs as ranges |
| [pmontalb/MonopolyMarkovChain](https://github.com/pmontalb/MonopolyMarkovChain) (Python, MIT) | Estimates the transition matrix by Monte Carlo, then the stationary distribution | Plays whole games with money |
| [ishanpranav/monopoly](https://github.com/ishanpranav/monopoly) (C#, MIT) | Classic landing probabilities from a billion iterations, matching Collins | Plays whole games with money |
| [shreerajshrestha/Evolutionary-Optimization-of-Monopoly-Mega-Edition](https://github.com/shreerajshrestha/Evolutionary-Optimization-of-Monopoly-Mega-Edition), [Markovian-Optimization-…](https://github.com/shreerajshrestha/Markovian-Optimization-of-Monopoly-Mega-Edition) (Python 2 / Java, no licence) | Code of the Rollins College papers on the 52-space variant: genetic algorithm over buying probabilities, 52 × 52 transition matrices | Mortgages, auctions and trading. Their code appears to count doubles on any two of the three dice; Landlord counts the white dice only, as the rules say |

Online games such as [Richup.io](https://richup.io/) offer house-rule switches
(Free Parking money, no auctions, double pay on GO and more) but no analysis.

The question "is there a simulator that estimates win chances from a game
state?" was asked on [Board Games Stack Exchange #53688](https://boardgames.stackexchange.com/questions/53688/any-monopoly-simulators-that-estimate-win-chances-from-a-game-state)
in 2020. The practical answer there was a fork of gamescomputersplay with starting
properties per player. Landlord's focus is this question: a complete position,
uncertain values as ranges, house rules, bots that trade, and paired comparisons
between rule variants and trades.

## Literature

### Landing probabilities and Markov models

- R. Ash, R. Bishop (1972): *Monopoly as a Markov Process.* Mathematics Magazine 45,
  26–29. [PDF](https://conf.math.illinois.edu/~bishop/monopoly.pdf)
- I. Stewart (1996): *Mathematical Recreations*, Scientific American, April 1996.
  [Copy](http://www.math.yorku.ca/Who/Faculty/Steprans/Courses/2042/Monopoly/Stewart4.html)
- T. Collins: *Probabilities in the Game of Monopoly.*
  [tkcs-collins.com](http://www.tkcs-collins.com/truman/monopoly/monopoly.shtml).
  Exact Markov solution for short and long jail strategies; the reference for our
  movement test ([validation.md](validation.md#landing-probabilities-against-the-markov-solution)).
- possiblywrong (2012): *Re-Analysis of Monopoly.*
  [Blog](https://possiblywrong.wordpress.com/2012/12/26/re-analysis-of-monopoly/).
  Exact chain with 120 states; the stationary distribution needs hundreds of rolls
  to settle, longer than many real games. This is why Landlord simulates from the
  position instead of using stationary probabilities.
- Course material with the same method:
  [MIT SP.268](https://web.mit.edu/sp.268/www/probability_and_monopoly.pdf),
  [Bernard](https://www.carlabernard.ch/beni/downloads/bernard_monopoly.pdf),
  [Li (Williams College)](https://web.williams.edu/Mathematics/sjmiller/public_html/hudson/Li_Markov%20Chains%20in%20the%20Game%20of%20Monopoly.pdf),
  [arXiv 1410.1107](https://arxiv.org/pdf/1410.1107).
- Nilsson (Uppsala): *Exploring strategies in Monopoly using Markov chains and
  simulation.* [PDF](https://uu.diva-portal.org/smash/get/diva2:1471765/FULLTEXT01.pdf)

### The 52-space variant and the speed die

- Shrestha, Myers, Lewin (Rollins College): papers on optimising strategies for the
  52-space variant with genetic algorithms and simulation, e.g.
  [Towards an Optimal Strategy …](https://www.researchgate.net/publication/341804714_Towards_an_Optimal_Strategy_For_Monopoly_Mega_Edition_Using_Genetic_Algorithms_Simulations),
  [Optimizing Strategies … (2016)](https://www.researchgate.net/publication/315800283_Optimizing_Strategies_for_Monopoly_The_Mega_Edition_Using_Genetic_Algorithms_Simulations).
  Abstracts only seen.
- TIPE (France): *Monopoly sous l'œil de Markov : Dé Rapide et probabilité
  d'atterrissages.* [ResearchGate](https://www.researchgate.net/publication/382830505_Monopoly_sous_l'oeil_de_Markov_De_Rapide_et_probabilite_d'atterrissages_MCOT_TIPE_MP_Mathematiques_Chaine_de_Markov).
  Speed die on the 40-space board; abstract only seen.
- Rules references: [Wikibooks: The Speed Die](https://en.wikibooks.org/wiki/Monopoly/The_Speed_Die),
  [Monopoly Wiki: Speed Die](https://monopoly.fandom.com/wiki/Speed_Die).

### Strategy and game length from simulation

- Friedman, Henderson, Byuen, Gutiérrez Gallardo (2009): *Estimating
  the probability that the game of Monopoly never ends.* Winter Simulation
  Conference. [PDF](https://www.informs-sim.org/wsc09papers/036.pdf). About 12 % of
  two-player games with simple strategies never end; the basis of the `friedman`
  profile and of [a validation](validation.md#friedman-et-al-2009-games-that-never-end).
- S. Sammul (2018): *Learning to play Monopoly with Monte Carlo tree search.*
  BSc thesis, University of Edinburgh. Cited for the effect of trading on games
  reaching the turn limit.
- T. Darling: *How to Win at Monopoly – a Surefire Strategy.*
  [amnesta.net](https://www.amnesta.net/monopoly/). Three houses give the best
  return on almost every group; the basis of the `darling` profile.
- Frayn (2005): *An Evolutionary Approach to Strategies for the Game of
  Monopoly.* IEEE CIG. [Record](https://research.birmingham.ac.uk/en/publications/an-evolutionary-approach-to-strategies-for-the-game-of-monopoly-t/)
- Yasumura, Oguchi, Nitta (2001): *Negotiation strategy of agents in the
  MONOPOLY game.* IEEE CIRA. [IEEE Xplore](https://ieeexplore.ieee.org/document/1013210)

### Learning agents

- Bailis, Fachantidis, Vlahavas (2014): *Learning to play Monopoly: A
  Reinforcement Learning approach.* AISB 50.
  [Record](https://intelligence.csd.auth.gr/publication/*learning-to-play-monopoly-a-reinforcement-learning-approach/)
- Bonjour, Haliem, Alsalem, Thomas, Li, Aggarwal, Kejriwal, Bhargava (2022): *Decision Making in Monopoly using a Hybrid Deep
  Reinforcement Learning Approach.* IEEE TETCI 6(6).
  [arXiv 2103.00683](https://arxiv.org/abs/2103.00683) (2021). The fixed policies
  A, B and C there are the basis of the `fp_a`, `fp_b`, `fp_c` profiles. See also
  [Learning Monopoly Gameplay](https://www.cs.purdue.edu/homes/bb/learning_monopoly.pdf).
- Kejriwal et al.: GNOME,
  [A multi-agent simulator for generating novelty in monopoly](https://www.sciencedirect.com/science/article/abs/pii/S1569190X21000770),
  [arXiv 2507.03802](https://arxiv.org/abs/2507.03802).

### Monte Carlo statistics

- [Wilson score interval](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval)
  for win shares.
- [Common random numbers](https://en.wikipedia.org/wiki/Variance_reduction#Common_Random_Numbers_%28CRN%29)
  for paired comparisons.
