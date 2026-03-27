# ArtMood Factory OS - ERP

## Stack
- **Frontend**: Next.js 15.1.6 + React 19 + TypeScript
- **Styling**: Tailwind CSS + PostCSS
- **State**: Zustand
- **Database**: Supabase (SSR)
- **Icons**: Lucide React
- **Export**: xlsx

## Project Structure
- src/ - Source code principal
- sql/ - Database queries
- migrations/ - Supabase migrations
- scripts/ - Utility scripts
- tests/ - Test scenarios screenshot-based

## Rules
- Toujours verifier RLS Supabase avant les updates
- Tester avec screenshots apres chaque changement UI
- Paiement minimum 50% pour debloquer production
- GPS requis pour transition vers Installation

## Statuts projet
devis_confirmed → production → installation → SAV

## Business
- ART-XXXX = numero de projet client
- Paiement 50% minimum = production debloquee
- Paiement 90% minimum = installation debloquee
