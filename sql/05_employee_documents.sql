-- Employee Documents table
CREATE TABLE IF NOT EXISTS public.employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('contract','cin','cnss','certificate','diploma','work_permit','medical','insurance','other')),
    document_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    notes TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_employee_documents_user ON public.employee_documents(user_id);
CREATE INDEX idx_employee_documents_expiry ON public.employee_documents(expiry_date) WHERE expiry_date IS NOT NULL;
