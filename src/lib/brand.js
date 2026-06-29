// Dados do dono/provedor da plataforma e canal de contato (negociação de plano,
// adesão e fechamentos são feitos por este WhatsApp).
export const OWNER = {
  name: "A3 Tecnologia LTDA",
  cnpj: "27.958.294/0001-15",
  whatsappDisplay: "(75) 98710-7746",
  whatsappIntl: "5575987107746", // formato internacional para o link wa.me
};

export const ownerWhatsappLink = (text) =>
  `https://wa.me/${OWNER.whatsappIntl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
