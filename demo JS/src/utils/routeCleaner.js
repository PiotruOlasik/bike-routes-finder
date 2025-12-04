import fs from 'fs';

/**
 * Usuwa powtarzające się współrzędne z GeoJSON
 * @param {Object} geojsonData - Obiekt GeoJSON
 * @returns {Object} Wyczyszczony obiekt GeoJSON
 */
function removeDuplicateCoordinates(geojsonData) {
  if (!geojsonData.features) {
    return geojsonData;
  }
  
  const cleanedFeatures = [];
  
  for (const feature of geojsonData.features) {
    if (feature.geometry.type === 'LineString') {
      // Czyszczenie współrzędnych dla LineString
      const coordinates = feature.geometry.coordinates;
      const cleanedCoords = cleanLineCoordinates(coordinates);
      feature.geometry.coordinates = cleanedCoords;
      
    } else if (feature.geometry.type === 'MultiLineString') {
      // Czyszczenie współrzędnych dla MultiLineString
      const cleanedLines = [];
      for (const line of feature.geometry.coordinates) {
        const cleanedLine = cleanLineCoordinates(line);
        cleanedLines.push(cleanedLine);
      }
      feature.geometry.coordinates = cleanedLines;
    }
    
    cleanedFeatures.push(feature);
  }
  
  geojsonData.features = cleanedFeatures;
  return geojsonData;
}

/**
 * Czyści współrzędne linii usuwając duplikaty i backtracking
 * @param {Array<Array<number>>} coordinates - Tablica współrzędnych
 * @returns {Array<Array<number>>} Wyczyszczona tablica współrzędnych
 */
function cleanLineCoordinates(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return coordinates;
  }
  
  // Krok 1: Usuń bezpośrednie duplikaty
  const cleaned = [coordinates[0]];
  for (let i = 1; i < coordinates.length; i++) {
    if (!coordsEqual(coordinates[i], coordinates[i - 1])) {
      cleaned.push(coordinates[i]);
    }
  }
  
  // Krok 2: Usuń backtracking 
  const finalCleaned = removeBacktracking(cleaned);
  
  return finalCleaned;
}

/**
 * Sprawdza czy dwie współrzędne są równe
 * @param {Array<number>} coord1 - Pierwsza współrzędna [lon, lat]
 * @param {Array<number>} coord2 - Druga współrzędna [lon, lat]
 * @returns {boolean} Czy współrzędne są równe
 */
function coordsEqual(coord1, coord2) {
  return coord1[0] === coord2[0] && coord1[1] === coord2[1];
}

/**
 * Usuwa backtracking (fragmenty gdzie wracamy tą samą drogą)
 * @param {Array<Array<number>>} coordinates - Tablica współrzędnych
 * @returns {Array<Array<number>>} Wyczyszczona tablica współrzędnych
 */
function removeBacktracking(coordinates) {
  if (coordinates.length < 3) {
    return coordinates;
  }
  
  let i = 0;
  const result = [];
  
  while (i < coordinates.length) {
    result.push(coordinates[i]);
    
    // Sprawdź czy następne punkty tworzą backtracking
    let foundBacktrack = false;
    
    // Szukaj wzorca A→B→A
    for (let j = i + 2; j < Math.min(i + 15, coordinates.length); j++) {
      if (coordsEqual(coordinates[i], coordinates[j])) {
        // Znaleziono backtracking - pomiń punkty od i+1 do j
        console.log(`Znaleziono backtracking: pomijam ${j - i - 1} punktów między pozycją ${i + 1} a ${j}`);
        i = j;
        foundBacktrack = true;
        break;
      }
    }
    
    if (!foundBacktrack) {
      i++;
    }
  }
  
  return result;
}

/**
 * Analizuje problemy w GeoJSON i zwraca raport
 * @param {Object} geojsonData - Obiekt GeoJSON
 * @returns {Object} Raport z analizą problemów
 */
function analyzeGeojsonIssues(geojsonData) {
  const issues = {
    totalFeatures: 0,
    lineFeatures: 0,
    duplicateSegments: 0,
    backtrackingSegments: 0,
    totalCoordinatesBefore: 0,
    totalCoordinatesAfter: 0,
    issuesFound: []
  };
  
  for (const feature of geojsonData.features || []) {
    issues.totalFeatures++;
    
    if (['LineString', 'MultiLineString'].includes(feature.geometry.type)) {
      issues.lineFeatures++;
      
      if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates;
        issues.totalCoordinatesBefore += coords.length;
        
        // Analizuj problemy
        const featureIssues = analyzeLineIssues(coords);
        if (featureIssues.length > 0) {
          issues.issuesFound.push(...featureIssues);
          issues.duplicateSegments += featureIssues.filter(i => i.includes('duplicate')).length;
          issues.backtrackingSegments += featureIssues.filter(i => i.includes('backtracking')).length;
        }
      }
    }
  }
  
  return issues;
}

/**
 * Analizuje linię pod kątem problemów
 * @param {Array<Array<number>>} coordinates - Tablica współrzędnych
 * @returns {Array<string>} Lista znalezionych problemów
 */
function analyzeLineIssues(coordinates) {
  const issues = [];
  
  // Sprawdź bezpośrednie duplikaty
  for (let i = 1; i < coordinates.length; i++) {
    if (coordsEqual(coordinates[i], coordinates[i - 1])) {
      issues.push(`Duplicate at position ${i - 1}-${i}: ${JSON.stringify(coordinates[i])}`);
    }
  }
  
  // Sprawdź backtracking
  for (let i = 0; i < coordinates.length - 2; i++) {
    for (let j = i + 2; j < Math.min(i + 15, coordinates.length); j++) {
      if (coordsEqual(coordinates[i], coordinates[j])) {
        issues.push(`Backtracking from ${i} to ${j}: ${JSON.stringify(coordinates[i])}`);
        break;
      }
    }
  }
  
  return issues;
}

/**
 * Czyści konkretny plik 'best_circular_route.geojson'
 * @returns {Object|null} Wyczyszczony GeoJSON lub null w przypadku błędu
 */
function cleanBestCircularRoute() {
  const inputFile = 'best_circular_route.geojson';
  const outputFile = 'best_circular_route_cleaned.geojson';
  
  try {
    // Wczytaj plik
    console.log(`Wczytywanie pliku: ${inputFile}`);
    const fileContent = fs.readFileSync(inputFile, 'utf-8');
    const geojsonData = JSON.parse(fileContent);
    
    // Analizuj problemy przed czyszczeniem
    console.log('\n=== ANALIZA PROBLEMÓW ===');
    const issuesBefore = analyzeGeojsonIssues(geojsonData);
    console.log(`Znalezione problemy: ${issuesBefore.issuesFound.length}`);
    
    if (issuesBefore.issuesFound.length > 0) {
      // Pokaż pierwsze 10 problemów
      for (let i = 0; i < Math.min(10, issuesBefore.issuesFound.length); i++) {
        console.log(`  - ${issuesBefore.issuesFound[i]}`);
      }
      if (issuesBefore.issuesFound.length > 10) {
        console.log(`  ... i ${issuesBefore.issuesFound.length - 10} więcej`);
      }
    } else {
      console.log('  Brak znalezionych problemów!');
    }
    
    // Wyczyść dane
    console.log('\n=== CZYSZCZENIE DANYCH ===');
    const cleanedGeojson = removeDuplicateCoordinates(geojsonData);
    
    // Analizuj po czyszczeniu
    const issuesAfter = analyzeGeojsonIssues(cleanedGeojson);
    
    // Zapisz wyczyszczony plik
    fs.writeFileSync(outputFile, JSON.stringify(cleanedGeojson, null, 2));
    
    // Raport
    console.log('\n=== RAPORT ===');
    console.log(`Przed czyszczeniem: ${issuesBefore.totalCoordinatesBefore} współrzędnych`);
    console.log(`Po czyszczeniu: ${issuesAfter.totalCoordinatesBefore} współrzędnych`);
    const removedCount = issuesBefore.totalCoordinatesBefore - issuesAfter.totalCoordinatesBefore;
    console.log(`Usunięto: ${removedCount} powtórzonych współrzędnych`);
    console.log(`Plik wyjściowy: ${outputFile}`);
    
    return cleanedGeojson;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Błąd: Nie znaleziono pliku ${inputFile}`);
      console.log('Upewnij się, że plik znajduje się w tym samym katalogu');
    } else {
      console.log(`Błąd podczas przetwarzania: ${error.message}`);
    }
    return null;
  }
}

/**
 * Szybkie czyszczenie bez szczegółowej analizy
 * @returns {Object|null} Wyczyszczony GeoJSON lub null w przypadku błędu
 */
function quickCleanGeojson() {
  const inputFile = 'best_circular_route.geojson';
  const outputFile = 'best_circular_route_cleaned.geojson';
  
  try {
    const fileContent = fs.readFileSync(inputFile, 'utf-8');
    const geojsonData = JSON.parse(fileContent);
    
    const cleanedData = removeDuplicateCoordinates(geojsonData);
    
    fs.writeFileSync(outputFile, JSON.stringify(cleanedData, null, 2));
    
    console.log(`Plik wyczyszczony i zapisany jako: ${outputFile}`);
    
    return cleanedData;
    
  } catch (error) {
    console.log(`Błąd: ${error.message}`);
    return null;
  }
}

export {
  removeDuplicateCoordinates,
  cleanLineCoordinates,
  removeBacktracking,
  analyzeGeojsonIssues,
  cleanBestCircularRoute,
  quickCleanGeojson
};