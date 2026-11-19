---
title: A short history of computing
tags: [history, computing, long-read]
---

# A short history of computing

Reading notes collected over several months. This note is deliberately long:
it is the one I keep adding to, and it is split into many sections so that each
period can be found on its own.

## Mechanical calculation

Long before electronics, people built machines to add and multiply. The abacus
is thousands of years old and still taught in some schools as a way to build
number sense. In the seventeenth century Blaise Pascal built a geared adding
machine to help his father with tax accounts, and Gottfried Leibniz designed the
stepped reckoner, which could also multiply by repeated addition. These machines
were expensive, fragile and rare, but they established the idea that arithmetic
could be mechanised: a sequence of carries could be done by gears instead of by
a clerk. Slide rules, invented around the same period, traded exactness for
speed and remained an engineer's companion until pocket calculators arrived in
the 1970s.

## The Analytical Engine

Charles Babbage designed the Difference Engine to compute polynomial tables
without human error, and then the far more ambitious Analytical Engine. The
Analytical Engine had a "store" for numbers and a "mill" for operations, read
its program from punched cards borrowed from the Jacquard loom, and could branch
on the result of a computation. It was never finished in his lifetime. Ada
Lovelace wrote the notes on the engine that included a method for computing
Bernoulli numbers, often called the first published program, and she saw that
such a machine could manipulate symbols in general, not only numbers, which is
the insight behind every general-purpose computer since.

## Punched cards and tabulation

Herman Hollerith built electric tabulating machines to process the 1890 United
States census. Each person became a punched card, and the machines counted holes
with electrical contacts. The census was processed in a fraction of the time of
the previous one. Hollerith's company later merged into what became IBM, and
punched cards stayed the main medium for data and programs well into the 1970s.
Many programmers who learned on cards remember the discipline it imposed: a
dropped deck could take an afternoon to sort back into order, which is why
people drew a diagonal line across the top of the deck.

## Turing and computability

In 1936 Alan Turing described an abstract machine that reads and writes symbols
on an unbounded tape according to a finite table of rules. He used it to show
that some problems, such as deciding in general whether a program halts, cannot
be solved by any mechanical procedure. The same paper introduced the universal
machine: one machine that can simulate any other when given its description as
input. That is the theoretical root of the stored-program computer. During the
war Turing worked on breaking the Enigma cipher at Bletchley Park, where
electromechanical "bombes" searched for daily key settings.

## Electronic computers of the 1940s

Colossus, built in Britain to attack the Lorenz cipher, was electronic and
programmable by switches and plugs, but kept secret for decades. In the United
States, ENIAC used about eighteen thousand vacuum tubes and was reprogrammed by
rewiring plugboards, which could take days. The stored-program idea, written up
in the "First Draft of a Report on the EDVAC", put instructions in the same
memory as data. The Manchester Baby ran the first stored program in 1948, and
EDSAC in Cambridge offered a regular computing service to scientists from 1949.
Vacuum tubes failed often, so much of an operator's day went to finding and
replacing burnt-out tubes.

## Transistors and integrated circuits

The transistor, demonstrated at Bell Labs in 1947, replaced the vacuum tube with
something smaller, cooler and far more reliable. In the late 1950s Jack Kilby and
Robert Noyce independently showed how to put several transistors on one piece of
semiconductor: the integrated circuit. Gordon Moore observed in 1965 that the
number of components on a chip was doubling at a steady pace, an observation that
became a planning target for the whole industry for half a century. Each doubling
made computers cheaper, smaller and more power-efficient, which opened markets
nobody had planned for.

## Mainframes and time-sharing

Through the 1960s computing meant mainframes in air-conditioned rooms. IBM's
System/360 introduced a family of compatible machines, so software written for a
small model ran on a large one, a commercial idea as important as any technical
one. Batch processing meant waiting hours for results. Time-sharing systems such
as CTSS and later Multics let many users interact with one machine at once
through terminals, each feeling as if they had the computer to themselves. The
Multics project was over-ambitious, and two of its veterans built a much smaller
system at Bell Labs that became Unix.

## Unix and C

Unix was written to be small and composable: many little programs that each do
one thing, connected by pipes, with everything treated as a file. Rewriting it in
the C language in the early 1970s made it portable to new hardware, which was
rare for an operating system at the time. Universities received it cheaply, and
a generation of students learned operating systems by reading its source. The
Berkeley distribution added networking code that became the basis of the
internet's socket interface. Today's Linux, macOS and Android all descend from
these ideas, directly or by imitation.

## Personal computers

Microprocessors put an entire CPU on one chip. Hobbyist kits like the Altair 8800
were followed by ready-made machines: the Apple II, the Commodore PET and the
TRS-80 in 1977. VisiCalc, the first spreadsheet, gave businesses a reason to buy
an Apple II. The IBM PC in 1981 used off-the-shelf parts and a licensed operating
system, which allowed clone makers to copy it and drove prices down. The
graphical interface, developed at Xerox PARC with windows, icons and a mouse,
reached the public through the Macintosh in 1984 and later Windows.

## Networks and the internet

ARPANET connected its first nodes in 1969 using packet switching: messages broken
into small packets that travel independently and are reassembled at the
destination. TCP/IP, adopted across ARPANET in 1983, let different networks
interconnect, hence "internet". Email was the first application people could not
live without. In 1989 Tim Berners-Lee proposed the World Wide Web at CERN:
documents linked by hypertext, addressed by URLs and fetched over HTTP. The Mosaic
browser made the web graphical and easy, and within a few years businesses,
newspapers and governments were online.

## Open source

The free software movement argued that users should be able to study, change and
share the programs they run, and the GNU project built the tools to make that
possible. Linus Torvalds released the Linux kernel in 1991, and combined with GNU
tools it became a complete free operating system. The term "open source" arrived
in 1998 with a more business-friendly pitch. Version control moved from central
servers to distributed systems; Git, written in 2005 for kernel development,
made branching cheap and is now used almost everywhere.

## Mobile and cloud

Smartphones put a networked computer in most pockets and made the touch screen
the dominant interface. At the same time, companies stopped buying servers and
started renting computing by the hour from cloud providers. Virtual machines and
then containers made it cheap to package software with its dependencies and run
it anywhere. Most applications became thin clients talking to services in
remote data centres, which in turn raised new concerns about privacy and about
who controls personal data.

## Machine learning

Neural networks are an old idea that became practical when large datasets and
graphics processors arrived. In 2012 a deep convolutional network won an image
recognition contest by a wide margin, and the field moved quickly from there.
Word embeddings showed that meaning could be represented as positions in a
vector space, where similar words sit close together. Transformers, introduced
in 2017, made it possible to train very large language models on huge amounts of
text. Embedding models built on the same architecture are what make semantic
search over personal notes possible on an ordinary laptop.

## Threads to follow up

- Read the EDVAC report itself, not only summaries.
- Find a good account of the Multics project and why it failed commercially.
- Compare the Unix philosophy with how [[architecture]] splits the Brain CLI.
