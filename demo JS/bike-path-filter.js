function filter(surface, typRoweru) {
  if (!surface) return 'nieznana';

  const nawierzchnie = {
    szosowy: ['asphalt', 'concrete', 'paved'],
    trekking: ['asphalt', 'concrete', 'paved', 'gravel', 'compacted', 'fine_gravel'],
    mtb: ['asphalt', 'concrete', 'paved', 'gravel', 'compacted', 'fine_gravel', 'dirt', 'ground', 'grass', 'sand', 'cobblestone', 'clay']
  };

  if (!nawierzchnie[typRoweru]) return 'nieznany typ roweru';

  if (nawierzchnie[typRoweru].includes(surface)) {
    return 'przejezdna';
  } else {
    return 'nieprzejezdna';
  }
}
