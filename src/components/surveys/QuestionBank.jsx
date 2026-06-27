import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Download, ChevronDown, ChevronUp } from "lucide-react";
import { v4 as uuidv4 } from "https://cdn.jsdelivr.net/npm/uuid@9/+esm";

const QUESTION_BANK = {
  eleitoral_prefeito: {
    label: "Pesquisa Eleitoral - Prefeito",
    category: "social",
    questions: [
      { type: "sim_nao", text: "O(a) Sr(a) é eleitor(a) deste município?", required: true, options: [] },
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["16 a 17 anos", "18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "unica_escolha", text: "Qual o seu sexo?", required: true, options: ["Masculino", "Feminino"] },
      { type: "unica_escolha", text: "Qual a sua escolaridade?", required: true, options: ["Não alfabetizado", "Fundamental incompleto", "Fundamental completo", "Médio incompleto", "Médio completo", "Superior incompleto", "Superior completo"] },
      { type: "aberta", text: "Em qual bairro ou localidade o(a) Sr(a) reside?", required: true, options: [] },
      { type: "unica_escolha", text: "Como o(a) Sr(a) avalia a gestão atual do município?", required: true, options: ["Ótima", "Boa", "Regular", "Ruim", "Péssima"] },
      { type: "aberta", text: "Na sua opinião, qual é o principal problema que falta resolver na cidade?", required: false, options: [] },
      { type: "aberta", text: "Se a eleição para prefeito fosse hoje, em quem o(a) Sr(a) votaria? (nome do candidato)", required: true, options: [] },
      { type: "unica_escolha", text: "Considerando os possíveis candidatos, qual seria a sua intenção de voto para prefeito?", required: false, options: ["Candidato A", "Candidato B", "Candidato C", "Branco/Nulo", "Não sabe/Não respondeu"] },
      { type: "aberta", text: "Em quem o(a) Sr(a) votaria para vereador?", required: false, options: [] },
      { type: "unica_escolha", text: "Há algum nome que o(a) Sr(a) não votaria para prefeito de jeito nenhum?", required: false, options: ["Sim", "Não", "Prefiro não responder"] },
      { type: "aberta", text: "Se sim, qual nome o(a) Sr(a) rejeita para prefeito?", required: false, options: [] },
      { type: "unica_escolha", text: "Qual meio de comunicação o(a) Sr(a) mais utiliza para se informar?", required: false, options: ["TV", "Rádio", "Jornal impresso", "Redes sociais", "WhatsApp", "Outro"] },
    ]
  },
  eleitoral_vereador: {
    label: "Pesquisa Eleitoral - Vereador",
    category: "social",
    questions: [
      { type: "sim_nao", text: "O(a) Sr(a) é eleitor(a) deste município?", required: true, options: [] },
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["16 a 17 anos", "18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "unica_escolha", text: "Qual o seu sexo?", required: true, options: ["Masculino", "Feminino"] },
      { type: "unica_escolha", text: "Qual a sua escolaridade?", required: true, options: ["Não alfabetizado", "Fundamental incompleto", "Fundamental completo", "Médio incompleto", "Médio completo", "Superior incompleto", "Superior completo"] },
      { type: "aberta", text: "Em qual bairro ou localidade o(a) Sr(a) reside?", required: true, options: [] },
      { type: "aberta", text: "Se a eleição fosse hoje, em quem o(a) Sr(a) votaria para vereador?", required: true, options: [] },
      { type: "unica_escolha", text: "O(a) Sr(a) conhece o trabalho do vereador atual pelo seu bairro?", required: false, options: ["Sim, conheço bem", "Conheço um pouco", "Não conheço"] },
      { type: "unica_escolha", text: "Como avalia o trabalho da Câmara Municipal?", required: false, options: ["Ótimo", "Bom", "Regular", "Ruim", "Péssimo", "Não sei opinar"] },
    ]
  },
  satisfacao_servicos: {
    label: "Satisfação com Serviços Públicos",
    category: "urbano",
    questions: [
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "unica_escolha", text: "Qual o seu sexo?", required: true, options: ["Masculino", "Feminino"] },
      { type: "aberta", text: "Em qual bairro ou localidade o(a) Sr(a) reside?", required: true, options: [] },
      { type: "escala", text: "Como avalia a qualidade da coleta de lixo no seu bairro?", required: true, options: [] },
      { type: "escala", text: "Como avalia a iluminação pública no seu bairro?", required: true, options: [] },
      { type: "escala", text: "Como avalia a qualidade das vias públicas (ruas e calçadas)?", required: true, options: [] },
      { type: "escala", text: "Como avalia o atendimento nos postos de saúde municipais?", required: false, options: [] },
      { type: "multipla_escolha", text: "Quais serviços públicos o(a) Sr(a) considera mais precários?", required: false, options: ["Saúde", "Educação", "Transporte", "Segurança", "Saneamento", "Habitação"] },
      { type: "aberta", text: "O(a) Sr(a) tem alguma sugestão para melhorar os serviços da cidade?", required: false, options: [] },
    ]
  },
  ambiental: {
    label: "Pesquisa Ambiental",
    category: "ambiental",
    questions: [
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "aberta", text: "Em qual comunidade ou localidade o(a) Sr(a) reside?", required: true, options: [] },
      { type: "unica_escolha", text: "Há coleta de lixo regular na sua localidade?", required: true, options: ["Sim, regularmente", "Às vezes", "Raramente", "Não há coleta"] },
      { type: "sim_nao", text: "O(a) Sr(a) possui acesso a água tratada?", required: true, options: [] },
      { type: "sim_nao", text: "O(a) Sr(a) pratica algum tipo de reciclagem ou separação de resíduos?", required: false, options: [] },
      { type: "unica_escolha", text: "Como avalia a preservação do meio ambiente na sua região?", required: true, options: ["Muito bem preservado", "Bem preservado", "Regular", "Pouco preservado", "Muito degradado"] },
      { type: "multipla_escolha", text: "Quais problemas ambientais são mais visíveis na sua região?", required: false, options: ["Desmatamento", "Queimadas", "Poluição de rios", "Descarte irregular de lixo", "Erosão do solo", "Outro"] },
      { type: "aberta", text: "O(a) Sr(a) tem alguma sugestão para melhorar o meio ambiente local?", required: false, options: [] },
    ]
  },
  social_rural: {
    label: "Pesquisa Social - Zona Rural",
    category: "rural",
    questions: [
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "unica_escolha", text: "Qual o seu sexo?", required: true, options: ["Masculino", "Feminino"] },
      { type: "aberta", text: "Em qual comunidade ou assentamento o(a) Sr(a) reside?", required: true, options: [] },
      { type: "unica_escolha", text: "Qual a principal atividade econômica da sua família?", required: true, options: ["Agricultura familiar", "Pecuária", "Pesca", "Extrativismo", "Assalariado rural", "Outro"] },
      { type: "sim_nao", text: "O(a) Sr(a) tem acesso à internet na localidade?", required: false, options: [] },
      { type: "sim_nao", text: "O(a) Sr(a) tem acesso a crédito rural (como Pronaf)?", required: false, options: [] },
      { type: "multipla_escolha", text: "Quais são as maiores dificuldades enfrentadas no campo?", required: true, options: ["Acesso à água", "Estradas precárias", "Falta de assistência técnica", "Baixo preço dos produtos", "Falta de segurança", "Acesso à saúde", "Outro"] },
      { type: "escala", text: "Como avalia a qualidade de vida na zona rural atualmente?", required: true, options: [] },
    ]
  },
  mercado_viabilidade: {
    label: "Pesquisa Mercadológica - Viabilidade de Novo Negócio",
    category: "mercado",
    questions: [
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["16 a 17 anos", "18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "unica_escolha", text: "Qual o seu sexo?", required: true, options: ["Masculino", "Feminino"] },
      { type: "unica_escolha", text: "Qual a renda mensal da sua família?", required: false, options: ["Até 1 salário mínimo", "1 a 2 salários mínimos", "2 a 5 salários mínimos", "5 a 10 salários mínimos", "Mais de 10 salários mínimos", "Prefiro não responder"] },
      { type: "aberta", text: "Em qual bairro ou localidade o(a) Sr(a) reside?", required: true, options: [] },
      { type: "unica_escolha", text: "Com que frequência o(a) Sr(a) costuma comprar ou contratar este tipo de produto/serviço?", required: true, options: ["Diariamente", "Semanalmente", "Quinzenalmente", "Mensalmente", "Raramente", "Nunca"] },
      { type: "aberta", text: "Atualmente, onde o(a) Sr(a) costuma comprar/contratar este tipo de produto/serviço?", required: false, options: [] },
      { type: "unica_escolha", text: "Em média, quanto o(a) Sr(a) gasta por mês com este tipo de produto/serviço?", required: false, options: ["Até R$ 50", "R$ 51 a R$ 150", "R$ 151 a R$ 300", "R$ 301 a R$ 500", "R$ 501 a R$ 1.000", "Mais de R$ 1.000"] },
      { type: "multipla_escolha", text: "O que mais pesa na sua decisão na hora de escolher onde comprar/contratar?", required: true, options: ["Preço", "Qualidade", "Atendimento", "Localização/proximidade", "Variedade de produtos", "Marca/reputação", "Formas de pagamento"] },
      { type: "sim_nao", text: "Na sua opinião, falta na sua região um estabelecimento deste ramo?", required: true, options: [] },
      { type: "escala", text: "Qual seria o seu interesse em um novo estabelecimento deste ramo abrindo na sua região?", required: true, options: [] },
      { type: "unica_escolha", text: "Quanto o(a) Sr(a) estaria disposto(a) a pagar pelo produto/serviço principal deste negócio?", required: false, options: ["Bem abaixo da média do mercado", "Um pouco abaixo da média", "Na média do mercado", "Um pouco acima, se houver mais qualidade", "Não sei avaliar"] },
      { type: "unica_escolha", text: "Como o(a) Sr(a) prefere comprar ou ser atendido(a)?", required: false, options: ["Loja física", "Site/aplicativo", "Delivery / WhatsApp", "Tanto faz"] },
      { type: "escala", text: "Se um novo negócio deste ramo abrisse perto da sua casa, qual a chance de o(a) Sr(a) experimentar?", required: true, options: [] },
      { type: "aberta", text: "O que o(a) Sr(a) mais valorizaria em um novo negócio deste ramo?", required: false, options: [] },
    ]
  },
  mercado_participacao: {
    label: "Pesquisa Mercadológica - Participação de Mercado",
    category: "mercado",
    questions: [
      { type: "unica_escolha", text: "Qual a sua faixa etária?", required: true, options: ["16 a 17 anos", "18 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
      { type: "unica_escolha", text: "Qual o seu sexo?", required: true, options: ["Masculino", "Feminino"] },
      { type: "aberta", text: "Em qual bairro ou localidade o(a) Sr(a) reside?", required: true, options: [] },
      { type: "sim_nao", text: "O(a) Sr(a) costuma comprar ou utilizar este tipo de produto/serviço?", required: true, options: [] },
      { type: "unica_escolha", text: "Com que frequência o(a) Sr(a) compra ou utiliza este tipo de produto/serviço?", required: false, options: ["Diariamente", "Semanalmente", "Quinzenalmente", "Mensalmente", "Raramente"] },
      { type: "aberta", text: "Quais marcas ou empresas deste ramo o(a) Sr(a) conhece na sua região? (cite as que lembrar)", required: false, options: [] },
      { type: "aberta", text: "Qual marca ou empresa deste ramo o(a) Sr(a) MAIS utiliza atualmente?", required: true, options: [] },
      { type: "unica_escolha", text: "Há quanto tempo o(a) Sr(a) é cliente dessa empresa?", required: false, options: ["Menos de 6 meses", "6 meses a 1 ano", "1 a 3 anos", "Mais de 3 anos"] },
      { type: "multipla_escolha", text: "Por que o(a) Sr(a) escolheu essa empresa?", required: false, options: ["Preço", "Qualidade", "Atendimento", "Localização/proximidade", "Tradição/confiança", "Indicação de conhecidos", "Variedade", "Promoções"] },
      { type: "escala", text: "Como o(a) Sr(a) avalia a empresa que mais utiliza?", required: true, options: [] },
      { type: "sim_nao", text: "O(a) Sr(a) conhece ou já ouviu falar da nossa empresa? (informe o nome ao entrevistado)", required: true, options: [] },
      { type: "unica_escolha", text: "Qual é a sua relação com a nossa empresa?", required: false, options: ["Sou cliente atualmente", "Já fui cliente, mas não sou mais", "Conheço, mas nunca utilizei", "Não conhecia até agora"] },
      { type: "escala", text: "Qual a chance de o(a) Sr(a) recomendar a empresa que utiliza a um amigo ou familiar?", required: true, options: [] },
      { type: "aberta", text: "O que faria o(a) Sr(a) trocar de marca ou empresa neste ramo?", required: false, options: [] },
      { type: "aberta", text: "O(a) Sr(a) tem alguma sugestão ou crítica para as empresas deste ramo?", required: false, options: [] },
    ]
  },
};

export default function QuestionBank({ surveyCategory, onLoadQuestions, onClose }) {
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const handleLoad = () => {
    if (!selected) return;
    const bank = QUESTION_BANK[selected];
    const questions = bank.questions.map((q, i) => ({
      ...q,
      id: uuidv4(),
      order: i,
    }));
    onLoadQuestions(questions);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-base font-bold text-gray-900">Banco de Questões</h2>
            <p className="text-xs text-gray-500 mt-0.5">Carregue um questionário padrão e adapte como desejar</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {Object.entries(QUESTION_BANK).map(([key, bank]) => (
            <div
              key={key}
              className={`border-2 rounded-xl overflow-hidden transition-all cursor-pointer ${selected === key ? "border-blue-500" : "border-gray-200 hover:border-blue-200"}`}
              onClick={() => setSelected(selected === key ? null : key)}
            >
              <div className="p-3 flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected === key ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                  {selected === key && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{bank.label}</p>
                  <p className="text-xs text-gray-400">{bank.questions.length} questões • {bank.category}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(expanded === key ? null : key); }}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  {expanded === key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {expanded === key && (
                <div className="border-t bg-gray-50 px-4 py-3 space-y-1.5">
                  {bank.questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="shrink-0 w-5 h-5 bg-gray-200 rounded text-gray-500 flex items-center justify-center font-medium text-[10px]">{i + 1}</span>
                      <span className="leading-tight">{q.text}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">{q.type.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            disabled={!selected}
            onClick={handleLoad}
          >
            <Download className="w-4 h-4 mr-2" />
            Carregar Questões
          </Button>
        </div>
      </div>
    </div>
  );
}