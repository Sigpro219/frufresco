const fs = require('fs');

const path = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/components/StagingSpacesManagement.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!content.includes('adjustSpacesWithCascadingShift')) {
  content = content.replace(
    'formatSpaceLabel\n} from \'@/lib/stagingSpaceAllocator\';',
    'formatSpaceLabel,\n    adjustSpacesWithCascadingShift\n} from \'@/lib/stagingSpaceAllocator\';'
  ).replace(
    'formatSpaceLabel\r\n} from \'@/lib/stagingSpaceAllocator\';',
    'formatSpaceLabel,\r\n    adjustSpacesWithCascadingShift\r\n} from \'@/lib/stagingSpaceAllocator\';'
  );
}

// 2. Add handleAdjustOrderSpaces before handleManualSpaceChange
if (!content.includes('handleAdjustOrderSpaces')) {
  const target = '    // Cambiar manualmente el espacio de una orden';
  const newFunc = `    // Ajuste reactivo con reacomodación y compactación en cascada contigua del piso
    const handleAdjustOrderSpaces = (orderId: string, targetSpacesCount: number) => {
        if (readOnly) return;
        setManualSpacesMap(prev => adjustSpacesWithCascadingShift(prev, orderId, targetSpacesCount));
        setSaveSuccess(false);
    };

    // Cambiar manualmente el espacio de una orden`;

  content = content.replace(target, newFunc);
}

// 3. Replace onClick in the button
const oldButtonCode = `                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newSpaces = assigned.length > spaces ? assigned.slice(0, spaces) : assigned;
                                                                    setManualSpacesMap(prev => ({
                                                                        ...prev,
                                                                        [order.id]: newSpaces
                                                                    }));
                                                                    setSaveSuccess(false);
                                                                }}`;

const newButtonCode = `                                                            <button
                                                                type="button"
                                                                onClick={() => handleAdjustOrderSpaces(order.id, spaces)}`;

// Handle both LF and CRLF in oldButtonCode
content = content.replace(oldButtonCode, newButtonCode);
content = content.replace(oldButtonCode.replace(/\n/g, '\r\n'), newButtonCode.replace(/\n/g, '\r\n'));

fs.writeFileSync(path, content, 'utf8');
console.log('Patched StagingSpacesManagement.tsx successfully');
