document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard carregado!');
    
    const updateStats = async () => {
        try {
            const response = await fetch('/api/stats');
            if (response.ok) {
                const data = await response.json();
                console.log('Estatísticas atualizadas:', data);
            }
        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
    };

    setInterval(updateStats, 30000);

    const cards = document.querySelectorAll('.stat-card, .ranking-item, .server-item');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.05}s`;
        card.classList.add('fade-in');
    });
});
