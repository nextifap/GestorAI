/**
 * @param {Date | string | number} datetime - Aceita objeto Date, String ISO ou Timestamp
 */
export const formatarData = (datetime) => {
    const data = new Date(datetime);

    // Verifica se a data é válida para evitar "Invalid Date" na tela
    if (isNaN(data.getTime())) return "Data inválida";

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(data);
}