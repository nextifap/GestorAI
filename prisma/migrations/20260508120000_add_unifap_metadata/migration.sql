-- Migration: adiciona tabelas de metadados da UniFAP e insere registros iniciais
-- Cria tabelas para Institution, Course, CurriculumOverview, AcademicCalendarEvent,
-- Infrastructure, FacultyMember e RagMetadata. Não toca em CurriculumChunk (embeddings).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Institution
CREATE TABLE IF NOT EXISTS "Institution" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  founded_year INT,
  status TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course (ADS, SI etc.)
CREATE TABLE IF NOT EXISTS "Course" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES "Institution"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  degree TEXT,
  duration_semesters INT,
  workload_hours INT,
  objective TEXT,
  audience TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Curriculum overview (textual, não-embed)
CREATE TABLE IF NOT EXISTS "CurriculumOverview" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES "Course"(id) ON DELETE CASCADE,
  semester INT,
  topics TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Academic calendar events
CREATE TABLE IF NOT EXISTS "AcademicCalendarEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES "Institution"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Infrastructure / labs / maker spaces
CREATE TABLE IF NOT EXISTS "Infrastructure" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES "Institution"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Faculty / staff
CREATE TABLE IF NOT EXISTS "FacultyMember" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES "Institution"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  profile JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RAG metadata storage
CREATE TABLE IF NOT EXISTS "RagMetadata" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  version TEXT,
  language TEXT,
  last_updated TIMESTAMPTZ,
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insere dados base sobre UniFAP a partir do texto fornecido
-- Cria a instituição
INSERT INTO "Institution" (id, name, short_name, city, state, country, founded_year, status, description)
VALUES (
  gen_random_uuid(),
  'Centro Universitário Paraíso (UniFAP)',
  'UniFAP',
  'Juazeiro do Norte',
  'Ceará',
  'Brasil',
  2006,
  'Centro Universitário - nota máxima no MEC',
  'Polo tecnológico do Cariri cearense. 20 anos em 2026.'
)
ON CONFLICT DO NOTHING;

-- Localiza institution_id para usar nas demais inserções
WITH inst AS (
  SELECT id FROM "Institution" WHERE name = 'Centro Universitário Paraíso (UniFAP)' LIMIT 1
)

INSERT INTO "Course" (institution_id, name, code, degree, duration_semesters, workload_hours, objective, audience)
SELECT inst.id, v.name, v.code, v.degree, v.duration_semesters, v.workload_hours, v.objective, v.audience
FROM (SELECT id FROM "Institution" WHERE name = 'Centro Universitário Paraíso (UniFAP)' LIMIT 1) inst, (VALUES
  ('Análise e Desenvolvimento de Sistemas', 'ADS', 'Tecnólogo', 5, 2180, 'Formação rápida com foco em codificação, testes e implantação de software.', 'Desenvolvedores de software, analistas de suporte, programadores full-stack'),
  ('Sistemas de Informação', 'SI', 'Bacharelado', 8, 3040, 'Formação integral envolvendo gestão de infraestrutura, governança de TI e análise de negócios.', 'Gestores de TI, DBAs, arquitetos de sistemas, auditores')
) AS v(name, code, degree, duration_semesters, workload_hours, objective, audience)
ON CONFLICT DO NOTHING;

-- Insere eixos / tópicos de matriz curricular (resumo)
WITH c AS (
  SELECT id FROM "Course" WHERE name = 'Análise e Desenvolvimento de Sistemas' LIMIT 1
)
INSERT INTO "CurriculumOverview" (course_id, semester, topics)
SELECT c.id, 1, 'Lógica de Programação, POO (Java/Go), Desenvolvimento Web (Node.js/React), Mobile'
FROM c
ON CONFLICT DO NOTHING;

WITH c2 AS (
  SELECT id FROM "Course" WHERE name = 'Sistemas de Informação' LIMIT 1
)
INSERT INTO "CurriculumOverview" (course_id, semester, topics)
SELECT c2.id, 1, 'Modelagem de Dados, SQL, NoSQL (Supabase/MongoDB), Big Data, Engenharia de Software, DevOps, Qualidade de Software'
FROM c2
ON CONFLICT DO NOTHING;

INSERT INTO "AcademicCalendarEvent" (institution_id, title, event_date, description)
SELECT inst.id, v.title, v.event_date, v.description
FROM (SELECT id FROM "Institution" WHERE name = 'Centro Universitário Paraíso (UniFAP)' LIMIT 1) inst, (VALUES
  ('Início das aulas semestre 2026', '2026-02-01'::date, 'Início das aulas do semestre 2026'),
  ('Feriado e aniversário UniFAP 20 anos', '2026-02-02'::date, 'Feriado local e aniversário de 20 anos da UniFAP'),
  ('Dia do Profissional de Sistemas de Informação', '2026-03-14'::date, 'Comemoração do Dia do Profissional de Sistemas de Informação'),
  ('Período de Avaliação Parcial (AVP)', NULL::date, 'Abril/Maio: Período de Avaliação Parcial e entrega de anteprojetos de TCC'),
  ('Mostra PI (Mostra de Projetos Integradores)', '2026-06-01'::date, 'Mostra de Projetos Integradores (Mostra PI) no GaragemLAB, referências em Junho/Novembro')
) AS v(title, event_date, description)
ON CONFLICT DO NOTHING;

INSERT INTO "Infrastructure" (institution_id, name, description, features)
SELECT inst.id, v.name, v.description, v.features
FROM (SELECT id FROM "Institution" WHERE name = 'Centro Universitário Paraíso (UniFAP)' LIMIT 1) inst, (VALUES
  ('GaragemLAB', 'Espaço para inovação, empreendedorismo e prototipação. Pré-incubadora de projetos acadêmicos.', jsonb_build_object('purpose', 'pré-incubadora', 'activities', jsonb_build_array('prototipação','mentoria','mostras'))),
  ('FABLAB UniFAP', 'Laboratório de fabricação digital com impressoras 3D, cortadora laser e bancadas de eletrônica.', jsonb_build_object('equipments', jsonb_build_array('impressoras_3D_FDM','impressoras_resina','cortadora_laser','bancadas_eletronica'))),
  ('Laboratórios de Informática', 'Máquinas de alto desempenho com suporte a virtualização (Docker), desenvolvimento mobile e ambientes Linux/Windows.', jsonb_build_object('os', jsonb_build_array('linux','windows'), 'support', 'virtualizacao, docker'))
) AS v(name, description, features)
ON CONFLICT DO NOTHING;

INSERT INTO "FacultyMember" (institution_id, name, role, profile)
SELECT inst.id, v.name, v.role, v.profile
FROM (SELECT id FROM "Institution" WHERE name = 'Centro Universitário Paraíso (UniFAP)' LIMIT 1) inst, (VALUES
  ('Regis Coutinho', 'Gestor de TI / DPO', jsonb_build_object('notes','Gestor de TI e Data Protection Officer')),
  ('Pedro Tomáz', 'Infra & Dev', jsonb_build_object('team','Infra e Dev')),
  ('Rodrigo Pontes', 'Infra & Dev', jsonb_build_object('team','Infra e Dev')),
  ('Hudson Israel', 'Infra & Dev', jsonb_build_object('team','Infra e Dev')),
  ('Janailson Junio', 'Infra & Dev', jsonb_build_object('team','Infra e Dev')),
  ('Rivaldo Mascarenhas', 'Infra & Dev', jsonb_build_object('team','Infra e Dev'))
) AS v(name, role, profile)
ON CONFLICT DO NOTHING;

-- RAG metadata record
INSERT INTO "RagMetadata" (source, tags, version, language, last_updated, raw)
VALUES (
  'unifap_tech_handbook_2026',
  ARRAY['educação','tecnologia','cariri','ads','si','calendário'],
  '1.5',
  'pt-BR',
  now(),
  jsonb_build_object(
    'source', 'unifap_tech_handbook_2026',
    'summary', 'Metadados e referência curricular para ADS e SI (2026).',
    'last_updated', '2026-05-08'
  )
)
ON CONFLICT DO NOTHING;

-- Fim da migration
